/**
 * Netlify Function: manageKey
 * 
 * Handles management of existing API keys in Firestore.
 * Only users with the 'admin' role can modify keys.
 * 
 * @file /netlify/functions/manageKey.js
 * 
 * @requires firebase-admin
 * @requires jsonwebtoken
 * 
 * Supported operations:
 * PUT /manageKey/{keyId} - Update key role or isActive status
 * DELETE /manageKey/{keyId} - Deactivate a key
 */
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    })
  });
}

const db = admin.firestore();

// Middleware de autenticação e autorização usando JWT com chave do Firestore
const authenticate = async (event, requiredRoles) => {
  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Authentication required: Missing or invalid Authorization header' }),
    };
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.payload || !decodedHeader.payload.keyId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Bad Request: JWT payload missing keyId' }),
      };
    }
    const keyId = decodedHeader.payload.keyId;

    const keyDoc = await db.collection('keys').doc(keyId).get();

    if (!keyDoc.exists) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Forbidden: API key not found in "keys" collection' }),
      };
    }

    const keyData = keyDoc.data();
    const secret = keyData.secret;

    if (!secret) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error: Key document missing secret' }),
      };
    }

    const verifiedToken = jwt.verify(token, secret);

    if (!keyData.isActive) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Forbidden: API key is not active' }),
      };
    }

    if (!requiredRoles.includes(keyData.role)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: `Forbidden: Role "${keyData.role}" not authorized for this operation` }),
      };
    }

    return { authenticated: true, role: keyData.role, keyId: keyId };
  } catch (error) {
    console.error('Authentication error:', error);
    if (error.name === 'TokenExpiredError') {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Authentication failed: JWT expired', error: error.message }),
      };
    }
    if (error.name === 'JsonWebTokenError') {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Authentication failed: Invalid JWT signature or malformed token', error: error.message }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error during authentication', error: error.message }),
    };
  }
};

exports.handler = async (event, context) => {
  // Extrair identificador da URL (pode ser ID ou description)
  const pathSegments = event.path.split('/');
  const targetIdentifier = decodeURIComponent(pathSegments[pathSegments.length - 1]);

  if (!targetIdentifier || targetIdentifier === 'manageKey') {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing key identifier in path' }),
    };
  }

  // Autenticação - apenas admin pode gerenciar chaves
  const authResult = await authenticate(event, ['admin']);
  if (!authResult.authenticated) {
    return authResult;
  }

  // Verificar se a chave a ser gerenciada existe
  // Primeiro tentar buscar por ID, depois por description
  let targetKeyDoc = await db.collection('keys').doc(targetIdentifier).get();
  let targetKeyId = targetIdentifier;

  if (!targetKeyDoc.exists) {
    // Buscar por description
    const keysSnapshot = await db.collection('keys').where('description', '==', targetIdentifier).get();
    
    if (keysSnapshot.empty) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Key not found. Please check the description or ID.' }),
      };
    }

    if (keysSnapshot.size > 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Multiple keys found with this description. Please use the specific key ID.' }),
      };
    }

    targetKeyDoc = keysSnapshot.docs[0];
    targetKeyId = targetKeyDoc.id;
  }

  const currentKeyData = targetKeyDoc.data();

  if (event.httpMethod === 'PUT') {
    // Atualizar chave
    let updateData;
    try {
      updateData = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid JSON body', error: error.message }),
      };
    }

    // Validar dados de atualização
    const allowedFields = ['role', 'isActive', 'description'];
    const allowedRoles = ['admin', 'issuer', 'reader'];
    
    const updates = {};
    
    if (updateData.role !== undefined) {
      if (!allowedRoles.includes(updateData.role)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: `Invalid role provided. Allowed roles are: ${allowedRoles.join(', ')}` }),
        };
      }
      updates.role = updateData.role;
    }

    if (updateData.isActive !== undefined) {
      if (typeof updateData.isActive !== 'boolean') {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'isActive must be a boolean value' }),
        };
      }
      updates.isActive = updateData.isActive;
    }

    if (updateData.description !== undefined) {
      if (typeof updateData.description !== 'string' || updateData.description.trim().length < 3) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Description must be a string with at least 3 characters' }),
        };
      }

      const trimmedDescription = updateData.description.trim();
      
      // Verificar se description já existe em outra chave
      if (trimmedDescription !== currentKeyData.description) {
        const existingKeysSnapshot = await db.collection('keys').where('description', '==', trimmedDescription).get();
        if (!existingKeysSnapshot.empty) {
          return {
            statusCode: 409,
            body: JSON.stringify({ message: 'A key with this description already exists' }),
          };
        }
      }
      
      updates.description = trimmedDescription;
    }

    if (Object.keys(updates).length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No valid fields to update. Allowed fields: role, isActive, description' }),
      };
    }

    // Prevenir que admin se desative
    if (updates.isActive === false && currentKeyData.role === 'admin' && authResult.keyId === targetKeyId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Cannot deactivate your own admin key' }),
      };
    }

    // Prevenir que admin mude seu próprio role
    if (updates.role && updates.role !== 'admin' && currentKeyData.role === 'admin' && authResult.keyId === targetKeyId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Cannot change your own admin role' }),
      };
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updates.updatedBy = authResult.keyId;

    try {
      await db.collection('keys').doc(targetKeyId).update(updates);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Key updated successfully',
          id: targetKeyId,
          description: updates.description || currentKeyData.description,
          updates: updates
        }),
      };
    } catch (error) {
      console.error('Error updating key:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
      };
    }

  } else if (event.httpMethod === 'DELETE') {
    // Desativar chave (não deletar fisicamente)
    
    // Prevenir que admin se desative
    if (currentKeyData.role === 'admin' && authResult.keyId === targetKeyId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Cannot deactivate your own admin key' }),
      };
    }

    try {
      await db.collection('keys').doc(targetKeyId).update({
        isActive: false,
        deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        deactivatedBy: authResult.keyId
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Key deactivated successfully',
          id: targetKeyId,
          description: currentKeyData.description
        }),
      };
    } catch (error) {
      console.error('Error deactivating key:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
      };
    }

  } else {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed. Supported methods: PUT, DELETE' }),
    };
  }
};
