const admin = require('firebase-admin');
const jwt = require('jsonwebtoken'); // Import the jsonwebtoken library

// Inicializa o Firebase Admin SDK apenas uma vez
if (!admin.apps.length) {
  // Sempre usar variáveis de ambiente
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
    console.log('DEBUG: keyDoc in writeCertificate.js:', keyDoc); // Adicionado para depuração

    if (!keyDoc.exists) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Forbidden: API key not found in "keys" collection' }),
      };
    }

    // Verifique se keyDoc.data é uma função antes de chamá-la
    if (typeof keyDoc.data !== 'function') {
      console.error('DEBUG: keyDoc.data is not a function. keyDoc:', keyDoc);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error: Invalid key document structure' }),
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
  const authResult = await authenticate(event, ['admin', 'issuer']);
  if (!authResult.authenticated) {
    return authResult; // Retorna o erro de autenticação/autorização
  }

  let certificateData;
  try {
    certificateData = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON body', error: error.message }),
    };
  }

  // Validação de dados obrigatórios
  if (!certificateData || !certificateData.code || !certificateData.name || !certificateData.event) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing required certificate data in request body' }),
    };
  }

  try {
    // Verificar se já existe um certificado com o mesmo código
    const existingCertificate = await db.collection('certificates').doc(certificateData.code).get();
    if (existingCertificate.exists) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Certificate with this code already exists' }),
      };
    }

    // Adicionar timestamp e informações adicionais
    const certificateWithTimestamp = {
      ...certificateData,
      timestamp: new Date().toISOString(),
      createdBy: authResult.keyId,
    };

    // Criar certificado usando o código como ID do documento
    await db.collection('certificates').doc(certificateData.code).set(certificateWithTimestamp);
    
    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Certificate created successfully', id: certificateData.code }),
    };
  } catch (error) {
    console.error('Error writing certificate:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
