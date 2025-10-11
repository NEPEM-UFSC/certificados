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
const crypto = require('crypto'); // Para gerar secrets seguros

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
const BOOTSTRAP_SECRET = process.env.BOOTSTRAP_SECRET || 'nepemcert-bootstrap-secret';

/**
 * Gera um secret seguro para autenticação JWT
 * @returns {string} Secret aleatório de 48 caracteres base64url
 */
function generateSecret() {
  return crypto.randomBytes(36).toString('base64url'); // 48 caracteres
}

/**
 * Gera um keyId baseado em username com hash ofuscado
 * @param {string} username - Nome de usuário ou descrição base
 * @returns {string} ID ofuscado com salt nepemcert
 */
function generateKeyId(username) {
  const salt = 'nepemcert';
  const hash = crypto.createHash('sha256').update(username + salt).digest('hex').substring(0, 16);
  return `${username.replace(/\s+/g, '_').toLowerCase()}_${hash}`;
}

/**
 * Authenticates a request using JWT token from Authorization header.
 * @param {Object} event - Netlify event object
 * @param {string[]} requiredRoles - Roles allowed for this operation
 * @param {boolean} allowBootstrap - Whether to allow bootstrap token
 * @returns {Promise<Object>} Auth result or error response
 */
async function authenticate(event, requiredRoles, allowBootstrap = false) {
  const authHeader = event.headers && (event.headers.authorization || event.headers.Authorization);
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Authentication required: Missing or invalid Authorization header' }),
    };
  }

  const token = authHeader.split(' ')[1]; // O JWT

  try {
    // 1. Decodificar o payload para extrair o keyId sem verificar a assinatura
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.payload.keyId) {
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
}

exports.handler = async (event, context) => {
  // Only POST is accepted for creating keys in tests; other methods should return 405
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  // Authenticate early so tests expecting 401/403/500 from auth paths get correct responses
  // Allow bootstrap token for initial key creation
  const authResult = await authenticate(event, ['admin'], true);
  if (!authResult.authenticated) {
    return authResult;
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

  // Validate required fields per tests: role and isActive are mandatory; description optional
  if (!keyData || !keyData.role || typeof keyData.isActive === 'undefined') {
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
      body: JSON.stringify({ message: 'Invalid role provided' }),
    };
  }

  try {
    // Gerar secret seguro
    const secret = generateSecret();
    
    // Gerar keyId ofuscado baseado na description (ou role se não houver description)
    const baseForId = keyData.description ? keyData.description.trim() : keyData.role;
    const keyId = generateKeyId(baseForId);
    
    // Verificar se já existe uma chave com este keyId
    const existingKey = await db.collection('keys').doc(keyId).get();
    if (existingKey.exists) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'A key with this identifier already exists. Please use a different description.' }),
      };
    }

    const toSave = {
      secret: secret, // CRÍTICO: Salvar o secret para autenticação JWT
      role: keyData.role,
      isActive: keyData.isActive,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: authResult.keyId, // Rastreabilidade: quem criou esta chave
    };

    // Only include description if provided
    if (typeof keyData.description === 'string') {
      toSave.description = keyData.description.trim();
    }

    // Usar o keyId gerado como ID do documento
    await db.collection('keys').doc(keyId).set(toSave);

    return {
      statusCode: 201,
      body: JSON.stringify({ 
        message: 'Key created successfully', 
        keyId: keyId, 
        secret: secret, // IMPORTANTE: Retornar secret APENAS uma vez, na criação
        role: toSave.role, 
        isActive: toSave.isActive,
        warning: 'Save the secret securely! It will not be shown again.'
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
