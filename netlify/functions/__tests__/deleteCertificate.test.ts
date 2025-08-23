// Importe o handler que você está testando.
import { handler } from '../deleteCertificate'; 
import { createMockEvent } from './test-utils';
import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';

// --- Mocks ---
// 1. Declaramos os mocks no escopo do módulo.
const mockDelete = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();

// 2. Mock do Firebase Admin SDK usando INDIREÇÃO para evitar o erro de hoisting.
// Agora, quando o código chamar admin.firestore().collection(), ele executará nossa função de mock,
// que por sua vez chamará a variável `mockCollection` (que já terá sido inicializada).
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

// Mock do jsonwebtoken (permanece igual)
jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));

// --- Suíte de Testes ---
describe('deleteCertificate handler', () => {
  const mockContext = {};

  beforeEach(() => {
    // Limpa o estado de todos os mocks antes de cada teste.
    // Usar mockClear() em vez de clearAllMocks() pode ser mais seguro se você tiver mocks globais.
    mockDelete.mockClear();
    mockGet.mockClear();
    mockDoc.mockClear();
    mockCollection.mockClear();
    (jwt.decode as jest.Mock).mockClear();
    (jwt.verify as jest.Mock).mockClear();

    // 3. Configuramos a CADEIA de retornos dos mocks aqui.
    // Isso é feito antes de cada teste, garantindo um estado limpo.
    mockCollection.mockReturnValue({
      doc: mockDoc,
    });
    mockDoc.mockReturnValue({
      get: mockGet,
      delete: mockDelete,
    });

    // --- Configuração Padrão para o "Caminho Feliz" ---
    
    // Auth: A primeira chamada a `get()` retorna uma chave de admin válida.
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ secret: 'test-secret', isActive: true, role: 'admin' }),
    });

    // Certificado: A segunda chamada a `get()` retorna um certificado existente.
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ name: 'Test Certificate' }),
    });
    
    // Deleção: A chamada a `delete()` é bem-sucedida.
    mockDelete.mockResolvedValue({});

    // JWT: Mocks padrão para o JWT.
    (jwt.decode as jest.Mock).mockReturnValue({ payload: { keyId: 'test-key-id' } });
    (jwt.verify as jest.Mock).mockReturnValue({ role: 'admin' });
  });

  it('should return 405 if httpMethod is not DELETE', async () => {
    const event = createMockEvent('GET', '/.netlify/functions/deleteCertificate/test-id');
    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Method Not Allowed' });
  });

  it('should return 401 if authentication header is missing', async () => {
    const event = createMockEvent('DELETE', '/.netlify/functions/deleteCertificate/test-id');
    delete event.headers.authorization; 
    
    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Authentication required: Missing or invalid Authorization header' });
  });

  it('should return 400 if certificate ID is missing from path', async () => {
    const event = createMockEvent('DELETE', '/.netlify/functions/deleteCertificate/');
    event.pathParameters = {}; // Simula a ausência do ID de forma mais realista

    const response = await handler(event, mockContext);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Missing certificate ID' });
  });

  it('should return 403 if API key does not have admin role', async () => {
    // Sobrescrevemos apenas o mock necessário para este teste
    mockGet.mockReset(); // Limpa os mocks do beforeEach
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'user' }), // Papel não autorizado
    });

    const event = createMockEvent('DELETE', '/.netlify/functions/deleteCertificate/test-id', { id: 'test-id' });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Forbidden: Role "user" is not authorized for this operation' });
  });

  it('should return 404 if certificate does not exist', async () => {
    mockGet.mockReset();
    // 1ª chamada (auth): OK
    mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ role: 'admin' }),
    });
    // 2ª chamada (certificado): Não existe
    mockGet.mockResolvedValueOnce({
        exists: false,
    });

    const event = createMockEvent('DELETE', '/.netlify/functions/deleteCertificate/test-id', { id: 'test-id' });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Certificate not found' });
  });

  it('should successfully delete a certificate and return 200', async () => {
    const event = createMockEvent('DELETE', '/.netlify/functions/deleteCertificate/test-id', { id: 'test-id' });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body!)).toEqual({ message: 'Certificate deleted successfully' });
    
    // As verificações agora são mais limpas e diretas
    expect(mockCollection).toHaveBeenCalledWith('certificates');
    expect(mockDoc).toHaveBeenCalledWith('test-id');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('should return 500 if Firestore delete operation fails', async () => {
    // Sobrescrevemos o mock de `delete` para simular um erro
    mockDelete.mockRejectedValue(new Error('Firestore delete error'));

    const event = createMockEvent('DELETE', '/.netlify/functions/deleteCertificate/test-id', { id: 'test-id' });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body!).message).toContain('Internal Server Error');
  });
});