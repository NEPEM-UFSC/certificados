import { JSDOM } from 'jsdom';

// HTML base que simula a estrutura da página principal
const htmlString = `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verificador de Certificados</title>
</head>
<body>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <div class="container mx-auto px-4 py-8">
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg shadow-lg p-8">
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">Verificador de Certificados</h1>
            <p class="text-gray-600">Digite o código do certificado para verificar sua autenticidade</p>
          </div>

          <div class="space-y-4">
            <div>
              <label for="certificateNumber" class="block text-sm font-medium text-gray-700 mb-2">
                Código do Certificado
              </label>
              <input
                type="text"
                id="certificateNumber"
                placeholder="Digite o código do certificado"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200"
              />
            </div>

            <button
              id="searchButton"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center"
            >
              <span data-lucide="search" class="w-5 h-5"></span>
              Buscar
            </button>
          </div>

          <div id="resultSection" class="hidden mt-6">
            <p id="resultMessage" class="text-center"></p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal -->
  <div id="certificateModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 items-center justify-center" role="dialog">
    <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4 relative">
      <button id="closeModal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
        <span data-lucide="x" class="w-6 h-6"></span>
      </button>
      
      <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Detalhes do Certificado</h2>
      
      <div id="modalContent" class="space-y-4">
        <!-- Content will be populated by JavaScript -->
      </div>
      
      <div class="mt-8 text-center">
        <button id="closeModalButton" class="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200">
          Fechar
        </button>
      </div>
    </div>
  </div>
</body>
</html>
`;

export function setupDOM(): JSDOM {
  const dom = new JSDOM(htmlString, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    resources: 'usable',
  });

  // Configura o ambiente global para simular um navegador
  global.window = dom.window as any;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.HTMLInputElement = dom.window.HTMLInputElement;
  global.HTMLButtonElement = dom.window.HTMLButtonElement;
  global.HTMLDivElement = dom.window.HTMLDivElement;
  global.HTMLParagraphElement = dom.window.HTMLParagraphElement;
  global.Event = dom.window.Event;
  global.KeyboardEvent = dom.window.KeyboardEvent;
  global.MouseEvent = dom.window.MouseEvent;

  // Mock para URLSearchParams se não existir
  if (!dom.window.URLSearchParams) {
    dom.window.URLSearchParams = global.URLSearchParams;
  }

  // Mock simples para location.search que é o que precisamos para os testes
  Object.defineProperty(dom.window.location, 'search', {
    writable: true,
    value: ''
  });

  // Adiciona métodos necessários se não existirem
  if (!dom.window.location.reload) {
    dom.window.location.reload = jest.fn();
  }
  if (!dom.window.location.replace) {
    dom.window.location.replace = jest.fn();
  }
  if (!dom.window.location.assign) {
    dom.window.location.assign = jest.fn();
  }

  return dom;
}

export function teardownDOM(dom?: JSDOM): void {
  if (dom && dom.window) {
    dom.window.close();
  }
  
  // Limpa as referências globais
  delete (global as any).window;
  delete (global as any).document;
  delete (global as any).HTMLElement;
  delete (global as any).HTMLInputElement;
  delete (global as any).HTMLButtonElement;
  delete (global as any).HTMLDivElement;
  delete (global as any).HTMLParagraphElement;
  delete (global as any).Event;
  delete (global as any).KeyboardEvent;
  delete (global as any).MouseEvent;
}
