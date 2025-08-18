const admin = require('firebase-admin');

// Inicializa o Firebase Admin SDK apenas uma vez
if (!admin.apps.length) {
  // Se a variável de ambiente do Netlify existir, use as variáveis de ambiente
  if (process.env.NETLIFY) {
    console.log("Rodando no ambiente Netlify, usando variáveis de ambiente.");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      })
    });
  } else {
    // Caso contrário, estamos rodando localmente, use o arquivo JSON
    console.log("Rodando localmente, usando o arquivo serviceAccountKey.json.");
    const serviceAccount = require('../../.firebaserc/serviceAccountKey.json'); // Ajuste o caminho!
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
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
    const certificatesQuery = await db.collection('certificates').where('code', '==', code).get(); // Buscar pelo campo 'code'

    if (certificatesQuery.empty) { // Verificar se a consulta retornou resultados
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Certificate not found' }),
      };
    }

    const certificateDoc = certificatesQuery.docs[0]; // Pegar o primeiro documento correspondente
    const certificateData = certificateDoc.data(); // Obter os dados do documento

    return {
      statusCode: 200,
      body: JSON.stringify({ id: certificateDoc.id, ...certificateData }), // Incluir o ID do documento no retorno
    };
  } catch (error) {
    console.error('Error fetching certificate:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
