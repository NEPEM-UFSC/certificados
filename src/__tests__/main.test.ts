import { JSDOM } from 'jsdom';
import { screen, fireEvent, waitFor } from '@testing-library/dom';
import { setupDOM, teardownDOM } from './dom-setup'; // Assumindo que este utilitário existe
import { init } from '../main';

// --- Mocks Globais ---

// Mock da biblioteca de ícones para evitar erros de `undefined`
// e permitir a verificação de chamadas.
global.lucide = {
  createIcons: jest.fn(),
};

// Mock do `fetch` global para controlar as respostas da API.
global.fetch = jest.fn();

// Helper para mockar uma resposta de sucesso da API
const mockFetchSuccess = (data: object) => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
};

// Helper para mockar uma resposta de erro da API
const mockFetchError = (status: number, statusText: string) => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status,
    statusText,
  });
};


describe('Certificate Search UI', () => {
  let dom: JSDOM;
  let originalLocation: Location;

  beforeEach(() => {
    dom = setupDOM(); // Configura o HTML base em um JSDOM

    // Mock de window.location para controlar a URL
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        href: 'http://localhost/',
        search: '',
        reload: jest.fn(),
      },
    });

    // Limpa os mocks antes de cada teste para garantir isolamento
    (fetch as jest.Mock).mockClear();
    (global.lucide.createIcons as jest.Mock).mockClear();
  });

  afterEach(() => {
    teardownDOM(dom);
    // Restaura o window.location original
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  // --- Testes de Interação do Usuário ---

  it('should display an error message if the input is empty on search', async () => {
    init(); // Inicializa os event listeners
    
    // A melhor prática é selecionar elementos como um usuário faria.
    const searchButton = screen.getByRole('button', { name: /buscar/i });
    fireEvent.click(searchButton);

    // `findByRole` espera o elemento aparecer no DOM.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Por favor, insira um código de certificado.');
    // Verificamos que o ícone de erro foi renderizado
    expect(global.lucide.createIcons).toHaveBeenCalled();
  });

  it('should fetch and display certificate details in a modal on success', async () => {
    const mockCertificate = {
      code: 'VALID123',
      name: 'John Doe',
      event: 'Community Meetup',
      createdBy: 'Admin',
      timestamp: new Date().toISOString(),
    };
    mockFetchSuccess(mockCertificate);
    
    init();

    const input = screen.getByLabelText(/código do certificado/i);
    const searchButton = screen.getByRole('button', { name: /buscar/i });

    fireEvent.change(input, { target: { value: 'VALID123' } });
    fireEvent.click(searchButton);

    // Espera o modal (identificado por seu role 'dialog') aparecer.
    const modal = await screen.findByRole('dialog');
    expect(modal).toBeVisible();

    // Verifica se os dados corretos estão no modal.
    expect(modal).toHaveTextContent(`Código: ${mockCertificate.code}`);
    expect(modal).toHaveTextContent(`Nome: ${mockCertificate.name}`);
    
    // Verifica a mensagem de sucesso para o usuário.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Certificado encontrado!');
    
    // Verifica se a API foi chamada corretamente.
    expect(fetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=VALID123');
  });

  describe('Modal Interactions', () => {
    // Para testes de fechar o modal, o inicializamos em um estado aberto.
    beforeEach(() => {
        init();
        const modal = document.getElementById('certificateModal')!;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    });

    it('should hide modal when the close button is clicked', () => {
      const modal = screen.getByRole('dialog');
      const closeButton = screen.getByRole('button', { name: /fechar/i });
      
      fireEvent.click(closeButton);
      
      // `waitFor` é perfeito para esperar que uma condição se torne verdadeira.
      // Aqui, esperamos que o modal não esteja mais visível.
      waitFor(() => {
        expect(modal).not.toBeVisible();
      });
    });

    it('should hide modal when clicking outside the modal content', () => {
      const modalBackdrop = screen.getByRole('dialog');
      
      // Clicamos no backdrop (o próprio elemento com role 'dialog')
      fireEvent.click(modalBackdrop);

      waitFor(() => {
        expect(modalBackdrop).not.toBeVisible();
      });
    });
  });

  // --- Testes de Respostas de Erro da API ---

  it('should display a "not found" message if API returns 404', async () => {
    mockFetchError(404, 'Not Found');
    init();

    const input = screen.getByLabelText(/código do certificado/i);
    const searchButton = screen.getByRole('button', { name: /buscar/i });

    fireEvent.change(input, { target: { value: 'NONEXISTENT' } });
    fireEvent.click(searchButton);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Certificado não encontrado em nossa base de dados.');
  });

  it('should display a generic error message for other API errors', async () => {
    mockFetchError(500, 'Internal Server Error');
    init();

    const input = screen.getByLabelText(/código do certificado/i);
    const searchButton = screen.getByRole('button', { name: /buscar/i });

    fireEvent.change(input, { target: { value: 'ANYCODE' } });
    fireEvent.click(searchButton);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ocorreu um erro ao verificar o certificado. Tente novamente.');
  });

  // --- Teste de Carregamento Inicial com Parâmetro de URL ---
  
  it('should automatically search for a certificate if "codigo" URL parameter is present', async () => {
    const mockCertificate = { code: 'URL123', name: 'Jane Doe', event: 'Workshop' };
    mockFetchSuccess(mockCertificate);

    // Modificamos a URL *antes* de inicializar a aplicação.
    Object.defineProperty(window, 'location', 'search', {
      writable: true,
      value: '?codigo=URL123',
    });

    init();

    // Verificamos se a API foi chamada automaticamente.
    expect(fetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=URL123');

    // Verificamos se o input foi preenchido.
    const input = screen.getByLabelText(/código do certificado/i);
    expect(input).toHaveValue('URL123');

    // E se o modal com os dados corretos apareceu.
    const modal = await screen.findByRole('dialog');
    expect(modal).toBeVisible();
    expect(modal).toHaveTextContent(`Nome: ${mockCertificate.name}`);
  });
});