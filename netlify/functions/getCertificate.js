const admin = require('firebase-admin');

// Inicializa o Firebase Admin SDK apenas uma vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
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

  const { id } = event.queryStringParameters; // Changed 'code' to 'id'

  if (!id) { // Changed 'code' to 'id'
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing "id" query parameter' }), // Updated message
    };
  }

  try {
    const certificateDoc = await db.collection('certificates').doc(id).get(); // Query by document ID

    if (!certificateDoc.exists) { // Check if document exists
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Certificate not found' }),
      };
    }

    const certificateData = certificateDoc.data(); // Get data directly from the document
    return {
      statusCode: 200,
      body: JSON.stringify(certificateData),
    };
  } catch (error) {
    console.error('Error fetching certificate:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
