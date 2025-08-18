const admin = require('firebase-admin');
const jwt = require('jsonwebtoken'); // Import the jsonwebtoken library

// Inicializa o Firebase Admin SDK apenas uma vez
if (!admin.apps.length) {
  if (process.env.NETLIFY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      })
    });
  } else {
    const serviceAccount = require('../../.firebaserc/serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
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

    // 2. Buscar a chave secreta no Firestore usando o keyId
    const keyDoc = await db.collection('keys').doc(keyId).get();

    if (!keyDoc.exists) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Forbidden: API key not found in "keys" collection' }),
      };
    }

    const keyData = keyDoc.data();
    const secret = keyData.secret; // A chave secreta para verificar o JWT

    if (!secret) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error: Key document missing secret' }),
      };
    }

    // 3. Verificar criptograficamente o JWT usando o secret recuperado
    const verifiedToken = jwt.verify(token, secret); // Isso também valida 'exp'

    // 4. Autorização baseada em regras de negócio
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
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  // Autenticação e autorização
  const authResult = await authenticate(event, ['admin']); // Apenas 'admin' pode criar chaves
  if (!authResult.authenticated) {
    return authResult; // Retorna o erro de autenticação/autorização
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
  if (!keyData || !keyData.role || typeof keyData.isActive === 'undefined') {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing required key data: role and isActive are mandatory' }),
    };
  }

  // Opcional: Validar se o role é um dos permitidos
  const allowedRoles = ['admin', 'issuer', 'reader'];
  if (!allowedRoles.includes(keyData.role)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Invalid role provided. Allowed roles are: ${allowedRoles.join(', ')}` }),
    };
  }

  try {
    // Adiciona um novo documento à coleção 'keys'. Firestore irá gerar um Document ID automaticamente.
    const docRef = await db.collection('keys').add(keyData);
    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Key created successfully', id: docRef.id, ...keyData }),
    };
  } catch (error) {
    console.error('Error creating key:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
