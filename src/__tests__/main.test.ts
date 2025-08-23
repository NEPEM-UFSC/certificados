import { init } from '../main';

// Mock CSS import
jest.mock('../styles.css', () => ({}));

// Create mock DOM elements
const createMockElement = (tagName: string, id?: string): HTMLElement => {
  const element = document.createElement(tagName) as HTMLElement;
  if (id) element.id = id;
  return element;
};

// Mock lucide
const mockLucide = {
  createIcons: jest.fn()
};
(global as any).lucide = mockLucide;

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('main.ts', () => {
  let searchButton: HTMLButtonElement;
  let certificateNumberInput: HTMLInputElement;
  let resultSection: HTMLDivElement;
  let resultMessage: HTMLParagraphElement;
  let certificateModal: HTMLDivElement;
  let closeModalButton: HTMLButtonElement;
  let closeModalIcon: HTMLButtonElement;
  let modalContent: HTMLDivElement;
  let originalLocation: Location;

  beforeEach(() => {
    // Clear all mocks
    mockLucide.createIcons.mockClear();
    mockFetch.mockClear();

    // Create mock DOM elements
    searchButton = createMockElement('button', 'searchButton') as HTMLButtonElement;
    certificateNumberInput = createMockElement('input', 'certificateNumber') as HTMLInputElement;
    resultSection = createMockElement('div', 'resultSection') as HTMLDivElement;
    resultMessage = createMockElement('p', 'resultMessage') as HTMLParagraphElement;
    certificateModal = createMockElement('div', 'certificateModal') as HTMLDivElement;
    closeModalButton = createMockElement('button', 'closeModalButton') as HTMLButtonElement;
    closeModalIcon = createMockElement('button', 'closeModal') as HTMLButtonElement;
    modalContent = createMockElement('div', 'modalContent') as HTMLDivElement;

    // Set up initial classes
    certificateModal.classList.add('hidden');
    resultSection.classList.add('hidden');

    // Mock getElementById
    jest.spyOn(document, 'getElementById').mockImplementation((id: string): HTMLElement | null => {
      const elements: Record<string, HTMLElement> = {
        'searchButton': searchButton,
        'certificateNumber': certificateNumberInput,
        'resultSection': resultSection,
        'resultMessage': resultMessage,
        'certificateModal': certificateModal,
        'closeModalButton': closeModalButton,
        'closeModal': closeModalIcon,
        'modalContent': modalContent
      };
      return elements[id] || null;
    });

    // Save original location and mock window.location
    originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = {
      ...originalLocation,
      search: ''
    } as Location;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore original location
    window.location = originalLocation;
  });

  describe('init function', () => {
    it('should initialize all DOM elements and lucide icons', () => {
      init();

      expect(document.getElementById).toHaveBeenCalledWith('searchButton');
      expect(document.getElementById).toHaveBeenCalledWith('certificateNumber');
      expect(document.getElementById).toHaveBeenCalledWith('resultSection');
      expect(document.getElementById).toHaveBeenCalledWith('resultMessage');
      expect(document.getElementById).toHaveBeenCalledWith('certificateModal');
      expect(document.getElementById).toHaveBeenCalledWith('closeModalButton');
      expect(document.getElementById).toHaveBeenCalledWith('closeModal');
      expect(document.getElementById).toHaveBeenCalledWith('modalContent');
      expect(mockLucide.createIcons).toHaveBeenCalled();
    });

    it('should handle missing lucide gracefully', () => {
      (global as any).lucide = undefined;
      expect(() => init()).not.toThrow();
    });
  });

  describe('modal functionality', () => {
    beforeEach(() => {
      init();
    });

    it('should show modal when closeModalButton is not clicked', () => {
      // Simulate showing modal
      certificateModal.classList.remove('hidden');
      certificateModal.classList.add('flex');

      expect(certificateModal.classList.contains('hidden')).toBe(false);
      expect(certificateModal.classList.contains('flex')).toBe(true);
    });

    it('should hide modal when closeModalButton is clicked', () => {
      // Show modal first
      certificateModal.classList.remove('hidden');
      certificateModal.classList.add('flex');

      // Click close button
      closeModalButton.click();

      expect(certificateModal.classList.contains('hidden')).toBe(true);
      expect(certificateModal.classList.contains('flex')).toBe(false);
    });

    it('should hide modal when closeModalIcon is clicked', () => {
      // Show modal first
      certificateModal.classList.remove('hidden');
      certificateModal.classList.add('flex');

      // Click close icon
      closeModalIcon.click();

      expect(certificateModal.classList.contains('hidden')).toBe(true);
      expect(certificateModal.classList.contains('flex')).toBe(false);
    });

    it('should hide modal when clicking outside modal content', () => {
      // Show modal first
      certificateModal.classList.remove('hidden');
      certificateModal.classList.add('flex');

      // Create click event on modal background
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: certificateModal });
      certificateModal.dispatchEvent(clickEvent);

      expect(certificateModal.classList.contains('hidden')).toBe(true);
      expect(certificateModal.classList.contains('flex')).toBe(false);
    });

    it('should not hide modal when clicking inside modal content', () => {
      // Show modal first
      certificateModal.classList.remove('hidden');
      certificateModal.classList.add('flex');

      // Create click event on modal content
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: modalContent });
      certificateModal.dispatchEvent(clickEvent);

      expect(certificateModal.classList.contains('hidden')).toBe(false);
      expect(certificateModal.classList.contains('flex')).toBe(true);
    });
  });

  describe('verifyCertificate function', () => {
    beforeEach(() => {
      init();
    });

    it('should show error message when code is empty', async () => {
      certificateNumberInput.value = '';
      searchButton.click();

      await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async

      expect(resultSection.classList.contains('hidden')).toBe(false);
      expect(resultSection.className).toContain('bg-red-100');
      expect(resultMessage.innerHTML).toContain('Por favor, insira um código de certificado.');
      expect(mockLucide.createIcons).toHaveBeenCalled();
    });

    it('should show loading state during verification', async () => {
      mockFetch.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      certificateNumberInput.value = 'TEST123';

      searchButton.click();

      expect(searchButton.disabled).toBe(true);
      expect(searchButton.innerHTML).toContain('Verificando...');
      expect(mockLucide.createIcons).toHaveBeenCalled();
    });

    it('should handle 404 response (certificate not found)', async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        ok: false
      });

      certificateNumberInput.value = 'NOTFOUND123';
      searchButton.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(resultSection.classList.contains('hidden')).toBe(false);
      expect(resultSection.className).toContain('bg-red-100');
      expect(resultMessage.innerHTML).toContain('Certificado não encontrado em nossa base de dados.');
      expect(searchButton.disabled).toBe(false);
      expect(searchButton.innerHTML).toContain('Buscar');
    });

    it('should handle other HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        status: 500,
        ok: false
      });

      certificateNumberInput.value = 'ERROR123';
      searchButton.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(resultSection.classList.contains('hidden')).toBe(false);
      expect(resultSection.className).toContain('bg-red-100');
      expect(resultMessage.innerHTML).toContain('Ocorreu um erro ao verificar o certificado.');
      expect(searchButton.disabled).toBe(false);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      certificateNumberInput.value = 'NETWORK123';
      searchButton.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(resultSection.classList.contains('hidden')).toBe(false);
      expect(resultSection.className).toContain('bg-red-100');
      expect(resultMessage.innerHTML).toContain('Ocorreu um erro ao verificar o certificado.');
      expect(searchButton.disabled).toBe(false);
    });

    it('should successfully display certificate with Firestore timestamp', async () => {
      const mockCertificate = {
        code: 'VALID123',
        name: 'John Doe',
        event: 'Test Event',
        createdBy: 'admin',
        timestamp: {
          _seconds: 1640995200 // Jan 1, 2022
        }
      };

      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockCertificate)
      });

      certificateNumberInput.value = 'VALID123';
      searchButton.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(resultSection.classList.contains('hidden')).toBe(false);
      expect(resultSection.className).toContain('bg-green-50');
      expect(resultMessage.innerHTML).toContain('Certificado encontrado!');
      
      expect(modalContent.innerHTML).toContain('VALID123');
      expect(modalContent.innerHTML).toContain('John Doe');
      expect(modalContent.innerHTML).toContain('Test Event');
      expect(modalContent.innerHTML).toContain('admin');
      expect(modalContent.innerHTML).toContain('janeiro'); // Portuguese month name
      
      expect(certificateModal.classList.contains('hidden')).toBe(false);
      expect(certificateModal.classList.contains('flex')).toBe(true);
      expect(searchButton.disabled).toBe(false);
    });

    it('should handle certificate with missing timestamp', async () => {
      const mockCertificate = {
        code: 'VALID456',
        name: 'Jane Doe',
        event: 'Another Event',
        createdBy: 'admin'
        // No timestamp
      };

      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockCertificate)
      });

      certificateNumberInput.value = 'VALID456';
      searchButton.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(modalContent.innerHTML).toContain('Data não disponível');
    });

    it('should trim whitespace from input', async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        ok: false
      });

      certificateNumberInput.value = '  TEST123  ';
      searchButton.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=TEST123');
    });
  });

  describe('URL parameter handling', () => {
    it('should auto-fill input and verify certificate from URL parameter', async () => {
      // Mock URLSearchParams to return a codigo parameter
      const mockURLSearchParams = jest.fn().mockImplementation(() => ({
        get: jest.fn().mockImplementation((param: string) => {
          if (param === 'codigo') return 'AUTO123';
          return null;
        })
      }));
      (global as any).URLSearchParams = mockURLSearchParams;

      mockFetch.mockResolvedValue({
        status: 404,
        ok: false
      });

      init();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(certificateNumberInput.value).toBe('AUTO123');
      expect(mockFetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=AUTO123');
    });

    it('should not auto-verify when no URL parameter is present', () => {
      const mockURLSearchParams = jest.fn().mockImplementation(() => ({
        get: jest.fn().mockReturnValue(null)
      }));
      (global as any).URLSearchParams = mockURLSearchParams;

      init();

      expect(certificateNumberInput.value).toBe('');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('search button click handler', () => {
    beforeEach(() => {
      init();
    });

    it('should trigger verification when search button is clicked', async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        ok: false
      });

      certificateNumberInput.value = 'CLICK123';
      searchButton.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=CLICK123');
    });
  });
});