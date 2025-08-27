/**
 * Netlify Function: createKey
 * 
 * Handles creation of new API keys in Firestore, with authentication and authorization via JWT.
 * Only users with the 'admin' role can create new keys.
 * 
 * @file /netlify/functions/createKey.js
 * 
 * @requires firebase-admin
 * @requires jsonwebtoken
 * 
 * @function authenticate
 * @async
 * @param {Object} event - Netlify function event object containing headers.
 * @param {string[]} requiredRoles - Array of roles allowed to perform the operation.
 * @returns {Promise<Object>} Authentication result or error response.
 * 
 * @function handler
 * @async
 * @param {Object} event - Netlify function event object.
 * @param {Object} context - Netlify function context object.
 * @returns {Promise<Object>} HTTP response object.
 * 
 * @typedef {Object} KeyData
 * @property {string} role - Role assigned to the key ('admin', 'issuer', 'reader').
 * @property {boolean} isActive - Whether the key is active.
 * @property {string} [secret] - Secret used for JWT verification.
 * 
 * @typedef {Object} AuthResult
 * @property {boolean} authenticated - Whether authentication succeeded.
 * @property {string} role - Role of the authenticated key.
 * @property {string} keyId - ID of the key used for authentication.
 * 
 * @description
 * - Initializes Firebase Admin SDK using environment variables.
 * - Authenticates requests using JWT, with secret fetched from Firestore based on keyId in JWT payload.
 * - Authorizes based on key role and isActive status.
 * - Validates request body for required key data.
 * - Creates a new key document in Firestore if authorized.
 * - Handles and returns appropriate HTTP status codes and error messages.
 */
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken'); // Import the jsonwebtoken library

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

// Chave especial para bootstrap inicial (não armazenada no Firestore)
const BOOTSTRAP_KEY_ID = 'nepemcert-bootstrap';
const BOOTSTRAP_SECRET = process.env.NEPEMCERT_BOOTSTRAP_SECRET || 'w7QseXqFTiWMWLFkK0GG2scQGW2FobrU';

// Middleware de autenticação e autorização usando JWT com chave do Firestore
const authenticate = async (event, requiredRoles, allowBootstrap = false) => {
  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Authentication required: Missing or invalid Authorization header' }),
    };
  }

  const token = authHeader.split(' ')[1]; // O JWT

  try {
    // 1. Decodificar o payload para extrair o keyId sem verificar a assinatura
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.payload || !decodedHeader.payload.keyId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Bad Request: JWT payload missing keyId' }),
      };
    }
    const keyId = decodedHeader.payload.keyId;

    // 2. Verificar se é a chave de bootstrap
    if (allowBootstrap && keyId === BOOTSTRAP_KEY_ID) {
      try {
        const verifiedToken = jwt.verify(token, BOOTSTRAP_SECRET);
        return { authenticated: true, role: 'bootstrap', keyId: BOOTSTRAP_KEY_ID };
      } catch (error) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Authentication failed: Invalid bootstrap token', error: error.message }),
        };
      }
    }

    // 3. Buscar a chave secreta no Firestore usando o keyId
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

    // 4. Verificar criptograficamente o JWT usando o secret recuperado
    const verifiedToken = jwt.verify(token, secret); // Isso também valida 'exp'

    // 5. Autorização baseada em regras de negócio
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
  if (event.httpMethod === 'GET') {
    // Listar chaves - apenas admin
    const authResult = await authenticate(event, ['admin']);
    if (!authResult.authenticated) {
      return authResult;
    }

    try {
      const keysSnapshot = await db.collection('keys').get();
      const keys = [];
      keysSnapshot.forEach(doc => {
        const keyData = doc.data();
        keys.push({
          id: doc.id,
          description: keyData.description,
          role: keyData.role,
          isActive: keyData.isActive,
          createdAt: keyData.createdAt || null,
          updatedAt: keyData.updatedAt || null,
          // Não retornar o secret por segurança
        });
      });

      // Ordenar por description para facilitar localização
      keys.sort((a, b) => a.description.localeCompare(b.description));

      return {
        statusCode: 200,
        body: JSON.stringify({ keys, total: keys.length }),
      };
    } catch (error) {
      console.error('Error listing keys:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
      };
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  let keyData;
  try {
    keyData = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON body', error: error.message }),
    };
  }

  // Validação básica dos dados da chave
  if (!keyData || !keyData.role || typeof keyData.isActive === 'undefined' || !keyData.description) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing required key data: role, isActive and description are mandatory' }),
    };
  }

  // Validar se o role é um dos permitidos
  const allowedRoles = ['admin', 'issuer', 'reader'];
  if (!allowedRoles.includes(keyData.role)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Invalid role provided. Allowed roles are: ${allowedRoles.join(', ')}` }),
    };
  }

  // Validar description
  if (typeof keyData.description !== 'string' || keyData.description.trim().length < 3) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Description must be a string with at least 3 characters' }),
    };
  }

  // Verificar se description já existe
  try {
    const existingKeysSnapshot = await db.collection('keys').where('description', '==', keyData.description.trim()).get();
    if (!existingKeysSnapshot.empty) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'A key with this description already exists' }),
      };
    }
  } catch (error) {
    console.error('Error checking existing descriptions:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error while validating description', error: error.message }),
    };
  }

  // Verificar autorização baseada no role solicitado
  if (keyData.role === 'reader') {
    // Para role 'reader', permite criação pública com chave bootstrap ou com chaves admin/issuer
    const authHeader = event.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Se tem token, verificar se é válido (admin, issuer ou bootstrap)
      const authResult = await authenticate(event, ['admin', 'issuer'], true);
      if (!authResult.authenticated) {
        return authResult;
      }
    } else {
      // Se não tem token, rejeitar - chave reader só pode ser criada com bootstrap
      return {
        statusCode: 401,
        body: JSON.stringify({ 
          message: 'Authentication required: Reader keys can only be created with bootstrap token. Use Authorization: Bearer <bootstrap_token>' 
        }),
      };
    }
  } else {
    // Para roles 'issuer' ou 'admin', apenas admin pode criar
    const authResult = await authenticate(event, ['admin'], false);
    if (!authResult.authenticated) {
      return authResult;
    }
  }

  try {
    if (!keyData.secret) {
      keyData.secret = require('crypto').randomBytes(32).toString('hex');
    }

    // Limpar e adicionar dados obrigatórios
    keyData.description = keyData.description.trim();
    keyData.createdAt = admin.firestore.FieldValue.serverTimestamp();

    // Adiciona um novo documento à coleção 'keys'
    const docRef = await db.collection('keys').add(keyData);
    
    return {
      statusCode: 201,
      body: JSON.stringify({ 
        message: 'Key created successfully', 
        id: docRef.id,
        description: keyData.description,
        role: keyData.role,
        isActive: keyData.isActive,
        // Retornar o secret apenas na criação para o usuário copiar
        secret: keyData.secret
      }),
    };
  } catch (error) {
    console.error('Error creating key:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
