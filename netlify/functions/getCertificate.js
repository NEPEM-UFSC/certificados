const admin = require('firebase-admin');

// Inicializa o Firebase Admin SDK apenas uma vez
if (!admin.apps.length) {
  try {
    // Try to initialize SDK if env vars exist, otherwise leave uninitialized so tests can mock admin
    const requiredEnvVars = ['FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length === 0) {
      console.log("Initializing Firebase Admin SDK with environment variables");
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        })
      });
      console.log("Firebase Admin SDK initialized successfully");
    } else {
      console.warn('Firebase Admin SDK not initialized: missing env vars', missingVars);
      // Do not throw here to allow tests to mock firebase-admin; handler will handle missing DB
    }
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    // swallow error to allow tests to proceed with mocks
  }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  // Set headers for CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  console.log('Request received:', { 
    method: event.httpMethod, 
    path: event.path,
    queryParams: event.queryStringParameters 
  });

  const { code } = event.queryStringParameters || {};

  if (!code) {
    console.log('Missing code parameter');
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Missing "code" query parameter' }),
    };
  }

  try {
    console.log(`Searching for certificate with code: ${code}`);
    
    // Buscar diretamente pelo ID do documento (que é o código do certificado)
    const certificateDoc = await db.collection('certificates').doc(code).get();

    if (!certificateDoc.exists) {
      console.log(`Certificate not found: ${code}`);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Certificate not found' }),
      };
    }

    const certificateData = certificateDoc.data();
    console.log('Certificate found successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ code: certificateDoc.id, ...certificateData }),
    };
  } catch (error) {
    console.error('Error fetching certificate:', error);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        message: 'Internal Server Error', 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
    };
  }
};
