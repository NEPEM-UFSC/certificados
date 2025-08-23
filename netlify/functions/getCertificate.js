const admin = require('firebase-admin');

// Inicializa o Firebase Admin SDK apenas uma vez
if (!admin.apps.length) {
  // Sempre usar variáveis de ambiente
  console.log("Usando variáveis de ambiente para Firebase Admin SDK");
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    })
  });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  const { code } = event.queryStringParameters; // Usar 'code' como parâmetro de consulta

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing "code" query parameter' }),
    };
  }

  try {
    // Buscar diretamente pelo ID do documento (que é o código do certificado)
    const certificateDoc = await db.collection('certificates').doc(code).get();

    if (!certificateDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Certificate not found' }),
      };
    }

    const certificateData = certificateDoc.data();

    return {
      statusCode: 200,
      body: JSON.stringify({ id: certificateDoc.id, ...certificateData }),
    };
  } catch (error) {
    console.error('Error fetching certificate:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
