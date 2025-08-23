// Importe o handler que você está testando.
import { handler } from '../writeCertificate';
import { createMockEvent } from './test-utils';
import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';

// --- Mocks Refatorados para Controle e Assertividade ---

// 1. Declaramos mocks nomeados para cada função do Firestore que será usada.
const mockSet = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();

// 2. Mock do Firebase Admin SDK usando INDIREÇÃO para evitar erros de hoisting.
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

// Mock do jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));

// --- Suíte de Testes ---

describe('writeCertificate handler', () => {
  const mockContext = {};

  beforeEach(() => {
    // Limpa o estado de todos os mocks para garantir o isolamento dos testes.
    mockSet.mockClear();
    mockGet.mockClear();
    mockDoc.mockClear();
    mockCollection.mockClear();
    (jwt.decode as jest.Mock).mockClear();
    (jwt.verify as jest.Mock).mockClear();

    // 3. Configuramos a CADEIA de retornos dos mocks.
    mockCollection.mockReturnValue({
      doc: mockDoc,
    });
    mockDoc.mockReturnValue({
      get: mockGet,
      set: mockSet,
    });

    // --- Configuração Padrão para o "Caminho Feliz" ---
    
    // Auth: A primeira chamada a `get()` (para a coleção 'keys') retorna um admin válido.
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ secret: 'test-secret', isActive: true, role: 'admin' }),
    });

    // Verificação de Conflito: A segunda chamada a `get()` (para 'certificates')
    // retorna que o documento NÃO existe, permitindo a criação.
    mockGet.mockResolvedValueOnce({
      exists: false,
    });
    
    // Escrita: A chamada a `set()` é bem-sucedida.
    mockSet.mockResolvedValue({});

    // JWT: Mocks padrão para autenticação.
    (jwt.decode as jest.Mock).mockReturnValue({ payload: { keyId: 'test-key-id' } });
    (jwt.verify as jest.Mock).mockReturnValue({ role: 'admin' });
  });

  it('should return 405 if httpMethod is not POST', async () => {
    const event = createMockEvent('GET', '/.netlify/functions/writeCertificate');
    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Method Not Allowed' });
  });

  it('should return 401 if authentication header is missing', async () => {
    const event = createMockEvent('POST', '/.netlify/functions/writeCertificate', {});
    delete event.headers.authorization;
    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Authentication required: Missing or invalid Authorization header' });
  });

  it('should return 400 if body is invalid JSON', async () => {
    const event = createMockEvent('POST', '/.netlify/functions/writeCertificate', 'invalid json');
    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!).message).toContain('Invalid JSON body');
  });

  it('should return 400 if required certificate data is missing', async () => {
    const event = createMockEvent('POST', '/.netlify/functions/writeCertificate', { name: 'Only name provided' }); // Body incompleto
    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Missing required certificate data in request body' });
  });

  it('should return 403 if role is not authorized', async () => {
    // Sobrescrevemos o mock de autenticação para este teste.
    mockGet.mockReset();
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'reader' }), // Papel não autorizado
    });
    
    const certificateData = { code: 'NEW123', name: 'Test User', event: 'Test Event' };
    const event = createMockEvent('POST', '/.netlify/functions/writeCertificate', certificateData);
    const response = await handler(event, mockContext);
    
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!).message).toContain('Forbidden: Role "reader" is not authorized for this operation');
  });

  it('should return 409 if certificate with the same code already exists', async () => {
    // Sobrescrevemos o mock de verificação de conflito.
    mockGet.mockReset();
    // 1ª chamada (auth): OK
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'admin' }),
    });
    // 2ª chamada (verificação de certificado): JÁ EXISTE
    mockGet.mockResolvedValueOnce({
      exists: true,
    });

    const certificateData = { code: 'EXISTING123', name: 'Test User', event: 'Test Event' };
    const event = createMockEvent('POST', '/.netlify/functions/writeCertificate', certificateData);
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Certificate with this code already exists' });
  });

  it('should return 500 if Firestore write operation fails', async () => {
    // Sobrescrevemos o mock da operação de escrita para simular um erro.
    mockSet.mockRejectedValue(new Error('Firestore write error'));

    const certificateData = { code: 'FAIL123', name: 'Test User', event: 'Test Event' };
    const event = createMockEvent('POST', '/.netlify/functions/writeCertificate', certificateData);
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body!).message).toContain('Internal Server Error');
  });

  it('should successfully write a new certificate and return 201', async () => {
    const certificateData = { code: 'NEW123', name: 'Test User', event: 'Test Event' };
    const event = createMockEvent('POST', '/.netlify/functions/writeCertificate', certificateData);
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(201);
    const responseBody = JSON.parse(response.body!);
    expect(responseBody.message).toBe('Certificate created successfully');
    expect(responseBody.id).toBe(certificateData.code);

    // Asserções Aprimoradas: Verificamos as interações com o Firestore.
    // Garante que a lógica de negócio está chamando o banco de dados corretamente.
    expect(mockCollection).toHaveBeenCalledWith('certificates');
    expect(mockDoc).toHaveBeenCalledWith(certificateData.code);
    expect(mockSet).toHaveBeenCalledTimes(1);
    // Verifica se o objeto passado para 'set' contém os dados corretos e um timestamp.
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      ...certificateData,
      timestamp: expect.any(String),
    }));
  });
});