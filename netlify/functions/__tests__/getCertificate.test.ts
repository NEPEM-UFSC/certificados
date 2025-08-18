const { handler } = require('../getCertificate');
const admin = require('firebase-admin');

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
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

describe('getCertificate Netlify Function', () => {
  let mockQuerySnapshot: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQuerySnapshot = {
      empty: false,
      docs: [{
        id: 'cert123',
        data: () => ({
          code: 'cert123',
          name: 'Test User',
          event: 'Test Event',
          createdBy: 'Admin',
          timestamp: new Date().toISOString(),
        }),
      }],
    };
    (admin.firestore().collection().where().get as jest.Mock).mockResolvedValue(mockQuerySnapshot);
  });

  it('should return 405 if httpMethod is not GET', async () => {
    const event = { httpMethod: 'POST' };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body)).toEqual({ message: 'Method Not Allowed' });
  });

  it('should return 400 if certificate code is missing', async () => {
    const event = { httpMethod: 'GET', queryStringParameters: {} };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ message: 'Missing certificate code' });
  });

  it('should return 404 if certificate not found', async () => {
    mockQuerySnapshot.empty = true;
    const event = { httpMethod: 'GET', queryStringParameters: { code: 'nonexistent' } };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ message: 'Certificate not found' });
  });

  it('should return 200 with certificate data if found', async () => {
    const event = { httpMethod: 'GET', queryStringParameters: { code: 'cert123' } };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('cert123');
    expect(body.name).toBe('Test User');
    expect(body.event).toBe('Test Event');
    expect(body.createdBy).toBe('Admin');
    expect(body).toHaveProperty('timestamp');
  });

  it('should return 500 if Firestore query fails', async () => {
    (admin.firestore().collection().where().get as jest.Mock).mockRejectedValue(new Error('Firestore error'));
    const event = { httpMethod: 'GET', queryStringParameters: { code: 'cert123' } };
    const context = {};
    const response = await handler(event, context);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toContain('Internal Server Error');
  });
});
