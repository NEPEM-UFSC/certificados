// Importe o handler que você está testando.
import { handler } from '../getCertificate';
import { createMockEvent } from './test-utils';
import admin from 'firebase-admin';

// --- Mocks Refatorados para Controle e Assertividade ---

// 1. Declaramos mocks nomeados para cada função na cadeia de chamadas do Firestore.
const mockGet = jest.fn();
const mockWhere = jest.fn();
const mockCollection = jest.fn();

// 2. Mock do Firebase Admin SDK usando INDIREÇÃO para evitar erros de hoisting.
// Isso nos dá controle total sobre cada passo da chamada ao banco de dados.
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
  firestore: () => ({
    collection: (...args) => mockCollection(...args),
  }),
}));

// --- Suíte de Testes ---

describe('getCertificate handler', () => {
  const mockContext = {};

  beforeEach(() => {
    // Limpa o estado de todos os mocks para garantir o isolamento dos testes.
    mockGet.mockClear();
    mockWhere.mockClear();
    mockCollection.mockClear();

    // 3. Configuramos a CADEIA de retornos dos mocks.
    // Isso simula o comportamento fluente do SDK do Firestore (collection(...).where(...).get()).
    mockCollection.mockReturnValue({
      where: mockWhere,
    });
    mockWhere.mockReturnValue({
      get: mockGet,
    });

    // --- Configuração Padrão para o "Caminho Feliz" ---
    // Por padrão, cada teste começará com o mock configurado para encontrar um certificado.
    const mockCertificateData = {
      code: 'cert123',
      name: 'Test User',
      event: 'Test Event',
      createdBy: 'Admin',
      timestamp: new Date().toISOString(),
    };
    
    mockGet.mockResolvedValue({
      empty: false,
      docs: [{
        id: 'cert123',
        data: () => mockCertificateData,
      }],
    });
  });

  it('should return 405 if httpMethod is not GET', async () => {
    const event = createMockEvent('POST', '/.netlify/functions/getCertificate');
    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body)).toEqual({ message: 'Method Not Allowed' });
  });

  it('should return 400 if "code" query parameter is missing', async () => {
    const event = createMockEvent('GET', '/.netlify/functions/getCertificate');
    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ message: 'Missing "code" query parameter' });
  });

  it('should return 404 if certificate is not found', async () => {
    // Sobrescrevemos o mock de `get` para simular uma query sem resultados.
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    const event = createMockEvent('GET', '/.netlify/functions/getCertificate', { code: 'nonexistent' });
    const response = await handler(event, mockContext);
    
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ message: 'Certificate not found' });
  });

  it('should return 200 with certificate data if found', async () => {
    const event = createMockEvent('GET', '/.netlify/functions/getCertificate', { code: 'cert123' });
    const response = await handler(event, mockContext);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Asserção Aprimorada: Verificamos se a query ao banco de dados foi feita corretamente.
    // Isso garante que a lógica de busca está correta, não apenas o resultado.
    expect(mockCollection).toHaveBeenCalledWith('certificates');
    expect(mockWhere).toHaveBeenCalledWith('code', '==', 'cert123');
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Asserção Aprimorada: Usamos `toEqual` no objeto inteiro para garantir
    // que a resposta é exatamente o que esperamos, sem campos a mais ou a menos.
    expect(body).toEqual({
      id: 'cert123',
      code: 'cert123',
      name: 'Test User',
      event: 'Test Event',
      createdBy: 'Admin',
      timestamp: expect.any(String), // O timestamp exato pode variar.
    });
  });

  it('should return 500 if Firestore query fails', async () => {
    // Sobrescrevemos o mock de `get` para simular uma falha no banco de dados.
    const firestoreError = new Error('Firestore query failed');
    mockGet.mockRejectedValue(firestoreError);

    const event = createMockEvent('GET', '/.netlify/functions/getCertificate', { code: 'any-code' });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toContain('Internal Server Error');
  });
});