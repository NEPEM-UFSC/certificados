import './styles.css'

// Utility to safely escape HTML special chars to prevent XSS
function escapeHTML(str: string): string {
  return str.replace(/[&<>"']/g, function (c) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    } as { [key: string]: string })[c];
  });
}

export function init() {
  const searchButton = document.getElementById('searchButton') as HTMLButtonElement;
  const certificateNumberInput = document.getElementById('certificateNumber') as HTMLInputElement;
  const resultSection = document.getElementById('resultSection') as HTMLDivElement;
  const certificateModal = document.getElementById('certificateModal') as HTMLDivElement;
  const closeModalButton = document.getElementById('closeModalButton') as HTMLButtonElement;
  const closeModalIcon = document.getElementById('closeModal') as HTMLButtonElement;
  const modalContent = document.getElementById('modalContent') as HTMLDivElement;

  // Render Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  const showModal = () => {
    certificateModal.classList.add('active');
  };

  const hideModal = () => {
    certificateModal.classList.remove('active');
  };

  closeModalButton.addEventListener('click', hideModal);
  closeModalIcon.addEventListener('click', hideModal);
  certificateModal.addEventListener('click', (e) => {
    if (e.target === certificateModal) {
      hideModal();
    }
  });

  const verifyCertificate = async (code: string) => {
    resultSection.classList.add('hidden'); // Hide previous results
    resultSection.innerHTML = ''; // Clear previous content

    if (!code) {
      resultSection.classList.remove('hidden');
      resultSection.className = 'result-card error';
      
      resultSection.innerHTML = `
        <div class="result-icon">
          <span data-lucide="alert-circle" class="text-error" width="24" height="24"></span>
        </div>
        <div class="result-content">
          <h3 class="text-error">Campo obrigatório</h3>
          <p class="text-error">Por favor, insira um código de certificado para realizar a busca.</p>
        </div>
      `;
      
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      return;
    }

    searchButton.disabled = true;
    searchButton.innerHTML = `<span data-lucide="loader" class="animate-spin" width="20" height="20"></span> Verificando...`;
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    try {
      const response = await fetch(`/.netlify/functions/getCertificate?code=${code}`);
      
      if (response.status === 404) {
        resultSection.classList.remove('hidden');
        resultSection.className = 'result-card warning';
        
        resultSection.innerHTML = `
          <div class="result-icon">
            <span data-lucide="search-x" class="text-warning" width="24" height="24"></span>
          </div>
          <div class="result-content">
            <h3 class="text-warning">Certificado não encontrado</h3>
            <p class="text-warning">Não encontramos nenhum certificado com o código <strong>${escapeHTML(code)}</strong>. Verifique se digitou corretamente.</p>
          </div>
        `;

        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
      
      const certificate = await response.json();

      if (certificate) {
        // Processar timestamp
        let formattedTimestamp = 'Data não disponível';
        
        if (certificate.timestamp) {
          let date: Date | null = null;
          
          if (typeof certificate.timestamp === 'string') {
             date = new Date(certificate.timestamp);
          } else if (certificate.timestamp._seconds) {
             date = new Date(certificate.timestamp._seconds * 1000);
          }

          if (date && !isNaN(date.getTime())) {
            formattedTimestamp = date.toLocaleString('pt-BR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            });
          }
        }

        modalContent.innerHTML = `
          <div class="cert-code-box">
            <div class="cert-code-label">Código de Autenticidade</div>
            <div class="cert-code-value">${escapeHTML(certificate.code)}</div>
          </div>
          
          <div class="cert-details">
            <div class="cert-detail-group">
              <div class="cert-icon">
                <span data-lucide="user" width="20" height="20"></span>
              </div>
              <div>
                <div class="cert-label">Participante</div>
                <div class="cert-value">${escapeHTML(certificate.name)}</div>
              </div>
            </div>

            <div class="cert-detail-group">
              <div class="cert-icon">
                <span data-lucide="calendar" width="20" height="20"></span>
              </div>
              <div>
                <div class="cert-label">Evento</div>
                <div class="cert-value">${escapeHTML(certificate.event)}</div>
              </div>
            </div>

            <div class="cert-detail-group">
              <div class="cert-icon">
                <span data-lucide="clock" width="20" height="20"></span>
              </div>
              <div>
                <div class="cert-label">Data de Emissão</div>
                <div class="cert-value" style="font-weight: 400;">${formattedTimestamp}</div>
              </div>
            </div>
            
            <div class="cert-detail-group" style="border-top: 1px solid #f3f4f6; padding-top: 1rem; margin-top: 0.5rem;">
              <div class="cert-icon">
                <span data-lucide="shield-check" width="20" height="20"></span>
              </div>
              <div>
                <div class="cert-label">Status</div>
                <div class="cert-value" style="color: var(--color-success);">Válido e Autêntico</div>
              </div>
            </div>
          </div>
        `;
        showModal();
        
        // Success message in main area
        resultSection.classList.remove('hidden');
        resultSection.className = 'result-card success';
        resultSection.innerHTML = `
          <div class="result-icon">
            <span data-lucide="check-circle" class="text-success" width="24" height="24"></span>
          </div>
          <div class="result-content">
            <h3 class="text-success">Certificado Válido</h3>
            <p class="text-success">O certificado de <strong>${escapeHTML(certificate.name)}</strong> foi verificado com sucesso.</p>
            <button id="viewDetailsBtn" class="btn-link mt-2">
              Ver detalhes novamente
            </button>
          </div>
        `;
        
        setTimeout(() => {
            const viewDetailsBtn = document.getElementById('viewDetailsBtn');
            if(viewDetailsBtn) {
                viewDetailsBtn.addEventListener('click', showModal);
            }
        }, 0);

      }
    } catch (error) {
      console.error('Erro ao carregar ou verificar o certificado:', error);
      resultSection.classList.remove('hidden');
      resultSection.className = 'result-card error';
      resultSection.innerHTML = `
        <div class="result-icon">
          <span data-lucide="alert-triangle" class="text-error" width="24" height="24"></span>
        </div>
        <div class="result-content">
          <h3 class="text-error">Erro de Conexão</h3>
          <p class="text-error">Ocorreu um erro ao verificar o certificado. Por favor, verifique sua conexão e tente novamente.</p>
        </div>
      `;
    } finally {
      searchButton.disabled = false;
      searchButton.innerHTML = `<span data-lucide="search" width="20" height="20"></span> Verificar Autenticidade`;
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  };

  searchButton.addEventListener('click', async () => {
    const code = certificateNumberInput.value.trim();
    verifyCertificate(code);
  });

  // Check for 'codigo' parameter in URL on page load
  const urlParams = new URLSearchParams(window.location.search);
  const codigoFromUrl = urlParams.get('codigo');

  if (codigoFromUrl) {
    certificateNumberInput.value = codigoFromUrl;
    verifyCertificate(codigoFromUrl);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});
