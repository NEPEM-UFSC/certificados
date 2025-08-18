const { handler } = require('../createKey');
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
    get: jest.fn(() => ({
      exists: true,
      data: () => ({ secret: 'test-secret', isActive: true, role: 'admin' }),
    })),
    add: jest.fn(),
  };
  return {
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
    firestore: jest.fn(() => mockFirestore),
    apps: [], // Simulate no apps initialized initially
  };
});

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));

describe('createKey Netlify Function', () => {
  let mockKeyDoc: any;
  let mockAddDoc: any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Firestore behavior
    mockKeyDoc = {
      exists: true,
      data: () => ({ secret: 'test-secret', isActive: true, role: 'admin' }),
    };
    (admin.firestore().collection().doc().get as jest.Mock).mockResolvedValue(mockKeyDoc);
    
    mockAddDoc = { id: 'new-key-id' };
    (admin.firestore().collection().add as jest.Mock).mockResolvedValue(mockAddDoc);

    // Mock JWT decode and verify
    (jwt.decode as jest.Mock).mockReturnValue({ payload: { keyId: 'test-key-id' } });
    (jwt.verify as jest.Mock).mockReturnValue({ role: 'admin' });
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

  it('should return 400 if JWT payload is missing keyId', async () => {
    (jwt.decode as jest.Mock).mockReturnValue({ payload: {} }); // Missing keyId
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'admin', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Bad Request: JWT payload missing keyId' });
  });

  it('should return 403 if API key not found in "keys" collection', async () => {
    mockKeyDoc.exists = false; // Key not found
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'admin', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Forbidden: API key not found in "keys" collection' });
  });

  it('should return 500 if key document is missing secret', async () => {
    mockKeyDoc.data = () => ({ isActive: true, role: 'admin' }); // Missing secret
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'admin', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Internal Server Error: Key document missing secret' });
  });

  it('should return 403 if API key is not active', async () => {
    mockKeyDoc.data = () => ({ secret: 'test-secret', isActive: false, role: 'admin' }); // Not active
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'admin', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Forbidden: API key is not active' });
  });

  it('should return 403 if role is not authorized', async () => {
    mockKeyDoc.data = () => ({ secret: 'test-secret', isActive: true, role: 'reader' }); // Wrong role
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'admin', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Forbidden: Role "reader" not authorized for this operation' });
  });

  it('should return 401 if JWT is expired', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      const error = new Error('jwt expired');
      (error as any).name = 'TokenExpiredError';
      throw error;
    });
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer expired-token' }, body: JSON.stringify({ role: 'admin', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body!).message).toContain('JWT expired');
  });

  it('should return 401 if JWT signature is invalid', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      const error = new Error('invalid signature');
      (error as any).name = 'JsonWebTokenError';
      throw error;
    });
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer invalid-token' }, body: JSON.stringify({ role: 'admin', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body!).message).toContain('Invalid JWT signature');
  });

  it('should return 400 if body is invalid JSON', async () => {
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: 'invalid json' };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!).message).toContain('Invalid JSON body');
  });

  it('should return 400 if required key data is missing', async () => {
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'admin' }) }; // Missing isActive
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Missing required key data: role and isActive are mandatory' });
  });

  it('should return 400 if an invalid role is provided', async () => {
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'superadmin', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!).message).toContain('Invalid role provided');
  });

  it('should successfully create a key with status 201', async () => {
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'issuer', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Key created successfully', id: 'new-key-id', role: 'issuer', isActive: true });
    expect((admin.firestore().collection().add as jest.Mock)).toHaveBeenCalledWith({ role: 'issuer', isActive: true });
  });

  it('should return 500 if Firestore add operation fails', async () => {
    (admin.firestore().collection().add as jest.Mock).mockRejectedValue(new Error('Firestore error'));
    const event: NetlifyEvent = { httpMethod: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ role: 'issuer', isActive: true }) };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body!).message).toContain('Internal Server Error');
  });
});

export {};
