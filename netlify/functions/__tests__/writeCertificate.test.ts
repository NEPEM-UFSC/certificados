const { handler } = require('../writeCertificate');
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
    set: jest.fn(),
    get: jest.fn(),
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

describe('writeCertificate Netlify Function', () => {
  let mockKeyDoc: any;
  let mockCertificateDoc: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockKeyDoc = {
      exists: true,
      data: jest.fn(() => ({ secret: 'test-secret', isActive: true, role: 'issuer' })),
    };
    (admin.firestore().collection().doc().get as jest.Mock).mockImplementation((docId) => {
      if (docId === 'test-key-id') {
        return Promise.resolve(mockKeyDoc);
      }
      // Ensure that the default return also has a data function
      return Promise.resolve({ exists: false, data: jest.fn(() => ({})) });
    });

    mockCertificateDoc = {
      exists: false, // Assume certificate does not exist by default for creation
      data: jest.fn(() => ({})), // Ensure data function is present
    };
    // The mock for doc().get() is now more robust, handling both keyDoc and other doc.get() calls.
    // No need for a separate mock for mockCertificateDoc.

    (admin.firestore().collection().doc().set as jest.Mock).mockResolvedValue({});

    (jwt.decode as jest.Mock).mockReturnValue({ payload: { keyId: 'test-key-id' } });
    (jwt.verify as jest.Mock).mockReturnValue({ role: 'issuer' });
  });

  it('should return 405 if httpMethod is not POST', async () => {
    const event: NetlifyEvent = { httpMethod: 'GET', headers: {} };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Method Not Allowed' });
  });

  it('should return 401 if authentication header is missing', async () => {
    const event: NetlifyEvent = { httpMethod: 'POST', headers: {} };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Authentication required: Missing or invalid Authorization header' });
  });

  it('should return 400 if body is invalid JSON', async () => {
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: 'invalid json' };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!).message).toContain('Invalid JSON body');
  });

  it('should return 400 if required certificate data is missing', async () => {
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ code: '123' }) }; // Missing name, event, createdBy
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Missing required certificate data: code, name, event, createdBy are mandatory' });
  });

  it('should return 403 if API key is not authorized for writing', async () => {
    mockKeyDoc.data = () => ({ secret: 'test-secret', isActive: true, role: 'reader' }); // Wrong role
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ code: '123', name: 'test', event: 'test', createdBy: 'test' }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Forbidden: Role "reader" not authorized for this operation' });
  });

  it('should return 409 if certificate with code already exists', async () => {
    mockCertificateDoc.exists = true; // Certificate already exists
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ code: 'existing-code', name: 'test', event: 'test', createdBy: 'test' }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Certificate with this code already exists' });
  });

  it('should successfully write a new certificate with status 201', async () => {
    const certificateData = { code: 'new-cert', name: 'New User', event: 'New Event', createdBy: 'New Admin' };
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify(certificateData) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(201);
    const responseBody = JSON.parse(response.body!);
    expect(responseBody.message).toBe('Certificate written successfully');
    expect(responseBody.id).toBe(certificateData.code);
    expect(responseBody.code).toBe(certificateData.code);
    expect(responseBody.name).toBe(certificateData.name);
    expect(responseBody.event).toBe(certificateData.event);
    expect(responseBody.createdBy).toBe(certificateData.createdBy);
    expect(responseBody).toHaveProperty('timestamp');
    expect(admin.firestore().collection().doc).toHaveBeenCalledWith(certificateData.code);
    expect((admin.firestore().collection().doc().set as jest.Mock)).toHaveBeenCalledWith(expect.objectContaining(certificateData));
  });

  it('should return 500 if Firestore set operation fails', async () => {
    (admin.firestore().collection().doc().set as jest.Mock).mockRejectedValue(new Error('Firestore set error'));
    const certificateData = { code: 'new-cert', name: 'New User', event: 'New Event', createdBy: 'New Admin' };
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify(certificateData) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body!).message).toContain('Internal Server Error');
  });
});

export {};
