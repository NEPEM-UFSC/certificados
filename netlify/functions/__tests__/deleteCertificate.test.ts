const { handler } = require('../deleteCertificate');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');

interface NetlifyEvent {
  httpMethod: string;
  headers: { [key: string]: string };
  body?: string;
  queryStringParameters?: { [key: string]: string };
  pathParameters?: { [key: string]: string };
}

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    delete: jest.fn(),
    get: jest.fn(() => ({
      exists: true,
      data: () => ({ secret: 'test-secret', isActive: true, role: 'admin' }),
    })),
  };
  return {
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
    firestore: jest.fn(() => mockFirestore),
    apps: [],
  };
});

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));

describe('deleteCertificate Netlify Function', () => {
  let mockKeyDoc: any;
  let mockCertificateDoc: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockKeyDoc = {
      exists: true,
      data: jest.fn(() => ({ secret: 'test-secret', isActive: true, role: 'admin' })),
    };
    (admin.firestore().collection().doc().get as jest.Mock).mockImplementation((docId) => {
      if (docId === 'test-key-id') {
        return Promise.resolve(mockKeyDoc);
      }
      // Ensure that the default return also has a data function
      return Promise.resolve({ exists: false, data: jest.fn(() => ({})) });
    });

    mockCertificateDoc = {
      exists: true,
      data: jest.fn(() => ({})), // Ensure data function is present
    };
    // The mock for doc().get() is now more robust, handling both keyDoc and other doc.get() calls.
    // No need for a separate mock for mockCertificateDoc.

    (admin.firestore().collection().doc().delete as jest.Mock).mockResolvedValue({});

    (jwt.decode as jest.Mock).mockReturnValue({ payload: { keyId: 'test-key-id' } });
    (jwt.verify as jest.Mock).mockReturnValue({ role: 'admin' });
  });

  it('should return 405 if httpMethod is not DELETE', async () => {
    const event: NetlifyEvent = { httpMethod: 'GET', headers: {} };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Method Not Allowed' });
  });

  it('should return 401 if authentication header is missing', async () => {
    const event: NetlifyEvent = { httpMethod: 'DELETE', headers: {} };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Authentication required: Missing or invalid Authorization header' });
  });

  it('should return 400 if certificate ID is missing from path parameters', async () => {
    const event: NetlifyEvent = { httpMethod: 'DELETE', headers: { authorization: 'Bearer test-token' }, queryStringParameters: {} };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Missing certificate ID' });
  });

  it('should return 403 if API key is not authorized for deletion', async () => {
    mockKeyDoc.data = () => ({ secret: 'test-secret', isActive: true, role: 'reader' }); // Wrong role
    const event: NetlifyEvent = { httpMethod: 'DELETE', headers: { authorization: 'Bearer test-token' }, queryStringParameters: { id: 'test-id' } };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Forbidden: Role "reader" not authorized for this operation' });
  });

  it('should return 404 if certificate not found', async () => {
    mockCertificateDoc.exists = false;
    const event: NetlifyEvent = { httpMethod: 'DELETE', headers: { authorization: 'Bearer test-token' }, queryStringParameters: { id: 'non-existent-id' } };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Certificate not found' });
  });

  it('should successfully delete a certificate with status 200', async () => {
    const event: NetlifyEvent = { httpMethod: 'DELETE', headers: { authorization: 'Bearer test-token' }, queryStringParameters: { id: 'test-id' } };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Certificate deleted successfully' });
    expect(admin.firestore().collection().doc).toHaveBeenCalledWith('test-id');
    expect((admin.firestore().collection().doc().delete as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('should return 500 if Firestore delete operation fails', async () => {
    (admin.firestore().collection().doc().delete as jest.Mock).mockRejectedValue(new Error('Firestore delete error'));
    const event: NetlifyEvent = { httpMethod: 'DELETE', headers: { authorization: 'Bearer test-token' }, queryStringParameters: { id: 'test-id' } };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body!).message).toContain('Internal Server Error');
  });
});

export {};
