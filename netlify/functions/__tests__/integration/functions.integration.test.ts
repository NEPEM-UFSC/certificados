// Integration tests for Netlify Functions
// These tests should be run when the functions are actually deployed or served locally.
// You would then make actual HTTP requests to the locally served functions.

// Use a porta fornecida pelo Jest ou uma porta padrão
const PORT = process.env.FUNCTIONS_PORT || 9999;
const BASE_URL = `http://localhost:${PORT}/.netlify/functions`;

// O fetch já está disponível globalmente em ambientes de teste Node recentes ou via polyfill.
import fetch from 'node-fetch'; // Ensure fetch is available in Node.js environment

describe('Netlify Functions Integration Tests', () => {
  // Helper to generate a simple JWT for testing authenticated endpoints
  // In a real scenario, you'd have a way to generate valid tokens,
  // possibly by calling your createKey function or using a test key.
  const generateTestToken = (keyId: string, secret: string, role: string) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ keyId, role }, secret, { expiresIn: '1h' });
  };

  // Placeholder for a test API key and secret (these would come from your test setup)
  // In a real integration test, you might create a temporary key in Firestore
  // before running tests, and delete it afterwards.
  const TEST_ADMIN_KEY_ID = 'test-admin-key-id';
  const TEST_ADMIN_SECRET = 'super-secret-admin-key';
  const TEST_ISSUER_KEY_ID = 'test-issuer-key-id';
  const TEST_ISSUER_SECRET = 'super-secret-issuer-key';

  let adminToken: string;
  let issuerToken: string;
  let createdCertificateCode: string;

  beforeAll(() => {
    // Generate tokens before all tests
    adminToken = generateTestToken(TEST_ADMIN_KEY_ID, TEST_ADMIN_SECRET, 'admin');
    issuerToken = generateTestToken(TEST_ISSUER_KEY_ID, TEST_ISSUER_SECRET, 'issuer');
  });

  // Integration Test for createKey function
  it('should create a new API key (createKey)', async () => {
    // This test would require a mock or actual Firestore setup
    // and a valid admin token to succeed.
    // For true integration, you'd need to ensure your local Firebase emulator is running
    // or connect to a test Firebase project.
    const response = await fetch(`${BASE_URL}/createKey`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ role: 'reader', isActive: true }),
    });

    expect(response.status).toBe(201);
    const data: any = await response.json(); // Explicitly cast to any
    expect(data.message).toBe('Key created successfully');
    expect(data).toHaveProperty('id');
    expect(data.role).toBe('reader');
  });

  // Integration Test for writeCertificate function
  it('should write a new certificate (writeCertificate)', async () => {
    createdCertificateCode = `test-cert-${Date.now()}`;
    const certificateData = {
      code: createdCertificateCode,
      name: 'Integration Test User',
      event: 'Integration Test Event',
      createdBy: 'Integration Test Admin',
    };

    const response = await fetch(`${BASE_URL}/writeCertificate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${issuerToken}`,
      },
      body: JSON.stringify(certificateData),
    });

    expect(response.status).toBe(201);
    const data: any = await response.json(); // Explicitly cast to any
    expect(data.message).toBe('Certificate written successfully');
    expect(data.id).toBe(createdCertificateCode);
  });

  // Integration Test for getCertificate function
  it('should retrieve a certificate by code (getCertificate)', async () => {
    const response = await fetch(`${BASE_URL}/getCertificate?code=${createdCertificateCode}`);
    expect(response.status).toBe(200);
    const data: any = await response.json(); // Explicitly cast to any
    expect(data.code).toBe(createdCertificateCode);
    expect(data.name).toBe('Integration Test User');
  });

  // Integration Test for deleteCertificate function
  it('should delete a certificate by ID (deleteCertificate)', async () => {
    const response = await fetch(`${BASE_URL}/deleteCertificate?id=${createdCertificateCode}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
    });
    expect(response.status).toBe(200);
    const data: any = await response.json(); // Explicitly cast to any
    expect(data.message).toBe('Certificate deleted successfully');

    // Verify it's actually deleted
    const verifyResponse = await fetch(`${BASE_URL}/getCertificate?code=${createdCertificateCode}`);
    expect(verifyResponse.status).toBe(404);
  });

  // Add more integration tests for error cases, edge cases, etc.
});
