import { JSDOM } from 'jsdom';
import { fireEvent } from '@testing-library/dom'; // Removed unused imports
import '@testing-library/jest-dom';

// Mock the fetch API
global.fetch = jest.fn();

// Mock lucide.createIcons as it's used in main.ts
// @ts-ignore
global.lucide = {
  createIcons: jest.fn(),
};

describe('main.ts', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    // Reset the DOM and fetch mock before each test
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <button id="searchButton"></button>
        <input id="certificateNumber" />
        <div id="resultSection" class="hidden">
          <p id="resultMessage"></p>
        </div>
        <div id="certificateModal" class="hidden">
          <button id="closeModalButton"></button>
          <button id="closeModal"></button>
          <div id="modalContent"></div>
        </div>
      </body>
      </html>
    `);
    document = dom.window.document;
    Object.defineProperty(dom.window, 'location', {
      value: {
        search: '',
        href: 'http://localhost/',
      },
      writable: true,
    });

    // Clear all mocks and re-import main.ts to ensure a fresh state
    jest.clearAllMocks();
    jest.resetModules();
    require('../main.ts'); // Re-import to re-run the DOMContentLoaded listener
  });

  it('should display an error message if certificate code is empty', async () => {
    const searchButton = document.getElementById('searchButton') as HTMLButtonElement;
    const certificateNumberInput = document.getElementById('certificateNumber') as HTMLInputElement;
    const resultSection = document.getElementById('resultSection') as HTMLDivElement;
    const resultMessage = document.getElementById('resultMessage') as HTMLParagraphElement;

    certificateNumberInput.value = '';
    fireEvent.click(searchButton);

    expect(resultSection).not.toHaveClass('hidden');
    expect(resultSection).toHaveClass('bg-red-100');
    expect(resultMessage).toHaveTextContent('Por favor, insira um código de certificado.');
    expect(global.lucide.createIcons).toHaveBeenCalled();
  });

  it('should show certificate details in modal if found', async () => {
    const mockCertificate = {
      code: '12345',
      name: 'Test User',
      event: 'Test Event',
      createdBy: 'Test Admin',
      timestamp: new Date().toISOString(),
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockCertificate),
    });

    const searchButton = document.getElementById('searchButton') as HTMLButtonElement;
    const certificateNumberInput = document.getElementById('certificateNumber') as HTMLInputElement;
    const certificateModal = document.getElementById('certificateModal') as HTMLDivElement;
    const modalContent = document.getElementById('modalContent') as HTMLDivElement;
    const resultSection = document.getElementById('resultSection') as HTMLDivElement;
    const resultMessage = document.getElementById('resultMessage') as HTMLParagraphElement;

    certificateNumberInput.value = '12345';
    fireEvent.click(searchButton);

    await dom.window.requestAnimationFrame(() => {}); // Wait for async operations

    expect(global.fetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=12345');
    expect(certificateModal).not.toHaveClass('hidden');
    expect(certificateModal).toHaveClass('flex');
    expect(modalContent).toHaveTextContent(`Código: ${mockCertificate.code}`);
    expect(modalContent).toHaveTextContent(`Nome: ${mockCertificate.name}`);
    expect(modalContent).toHaveTextContent(`Evento: ${mockCertificate.event}`);
    expect(modalContent).toHaveTextContent(`Criado por: ${mockCertificate.createdBy}`);
    expect(resultSection).not.toHaveClass('hidden');
    expect(resultSection).toHaveClass('bg-green-50');
    expect(resultMessage).toHaveTextContent('Certificado encontrado!');
    expect(global.lucide.createIcons).toHaveBeenCalledTimes(3); // Initial, loading, success
  });

  it('should hide modal when closeModalButton is clicked', async () => {
    const certificateModal = document.getElementById('certificateModal') as HTMLDivElement;
    const closeModalButton = document.getElementById('closeModalButton') as HTMLButtonElement;

    certificateModal.classList.remove('hidden'); // Make it visible first
    certificateModal.classList.add('flex');

    fireEvent.click(closeModalButton);

    expect(certificateModal).toHaveClass('hidden');
    expect(certificateModal).not.toHaveClass('flex');
  });

  it('should hide modal when closeModalIcon is clicked', async () => {
    const certificateModal = document.getElementById('certificateModal') as HTMLDivElement;
    const closeModalIcon = document.getElementById('closeModal') as HTMLButtonElement;

    certificateModal.classList.remove('hidden'); // Make it visible first
    certificateModal.classList.add('flex');

    fireEvent.click(closeModalIcon);

    expect(certificateModal).toHaveClass('hidden');
    expect(certificateModal).not.toHaveClass('flex');
  });

  it('should hide modal when clicking outside modal content', async () => {
    const certificateModal = document.getElementById('certificateModal') as HTMLDivElement;
    certificateModal.classList.remove('hidden');
    certificateModal.classList.add('flex');

    fireEvent.click(certificateModal); // Click on the modal background

    expect(certificateModal).toHaveClass('hidden');
    expect(certificateModal).not.toHaveClass('flex');
  });

  it('should display "Certificado não encontrado" if API returns 404', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const searchButton = document.getElementById('searchButton') as HTMLButtonElement;
    const certificateNumberInput = document.getElementById('certificateNumber') as HTMLInputElement;
    const resultSection = document.getElementById('resultSection') as HTMLDivElement;
    const resultMessage = document.getElementById('resultMessage') as HTMLParagraphElement;

    certificateNumberInput.value = 'nonexistent';
    fireEvent.click(searchButton);

    await dom.window.requestAnimationFrame(() => {});

    expect(global.fetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=nonexistent');
    expect(resultSection).not.toHaveClass('hidden');
    expect(resultSection).toHaveClass('bg-red-100');
    expect(resultMessage).toHaveTextContent('Certificado não encontrado em nossa base de dados.');
    expect(global.lucide.createIcons).toHaveBeenCalledTimes(3); // Initial, loading, error
  });

  it('should display generic error message if API returns other error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const searchButton = document.getElementById('searchButton') as HTMLButtonElement;
    const certificateNumberInput = document.getElementById('certificateNumber') as HTMLInputElement;
    const resultSection = document.getElementById('resultSection') as HTMLDivElement;
    const resultMessage = document.getElementById('resultMessage') as HTMLParagraphElement;

    certificateNumberInput.value = 'error-code';
    fireEvent.click(searchButton);

    await dom.window.requestAnimationFrame(() => {});

    expect(global.fetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=error-code');
    expect(resultSection).not.toHaveClass('hidden');
    expect(resultSection).toHaveClass('bg-red-100');
    expect(resultMessage).toHaveTextContent('Ocorreu um erro ao verificar o certificado. Tente novamente.');
    expect(global.lucide.createIcons).toHaveBeenCalledTimes(3); // Initial, loading, error
  });

  it('should handle "codigo" query parameter on page load', async () => {
    const mockCertificate = {
      code: 'URL123',
      name: 'URL User',
      event: 'URL Event',
      createdBy: 'URL Admin',
      timestamp: new Date().toISOString(),
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockCertificate),
    });

    // Set URL search parameter before re-importing main.ts
    Object.defineProperty(dom.window, 'location', {
      value: {
        search: '?codigo=URL123',
        href: 'http://localhost/?codigo=URL123',
      },
      writable: true,
    });

    // Re-import main.ts to trigger DOMContentLoaded and URL parameter check
    jest.resetModules();
    require('../main.ts');

    await dom.window.requestAnimationFrame(() => {});

    const certificateNumberInput = document.getElementById('certificateNumber') as HTMLInputElement;
    const resultSection = document.getElementById('resultSection') as HTMLDivElement;
    const resultMessage = document.getElementById('resultMessage') as HTMLParagraphElement;
    const certificateModal = document.getElementById('certificateModal') as HTMLDivElement;
    const modalContent = document.getElementById('modalContent') as HTMLDivElement;

    expect(certificateNumberInput.value).toBe('URL123');
    expect(global.fetch).toHaveBeenCalledWith('/.netlify/functions/getCertificate?code=URL123');
    expect(certificateModal).not.toHaveClass('hidden');
    expect(modalContent).toHaveTextContent(`Código: ${mockCertificate.code}`);
    expect(resultSection).not.toHaveClass('hidden');
    expect(resultMessage).toHaveTextContent('Certificado encontrado!');
  });
});
