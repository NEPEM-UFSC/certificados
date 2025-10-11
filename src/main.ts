import './styles.css'

export function init() {
  const searchButton = document.getElementById('searchButton') as HTMLButtonElement;
  const certificateNumberInput = document.getElementById('certificateNumber') as HTMLInputElement;
  const resultSection = document.getElementById('resultSection') as HTMLDivElement;
  const resultMessage = document.getElementById('resultMessage') as HTMLParagraphElement;
  const certificateModal = document.getElementById('certificateModal') as HTMLDivElement;
  const closeModalButton = document.getElementById('closeModalButton') as HTMLButtonElement;
  const closeModalIcon = document.getElementById('closeModal') as HTMLButtonElement;
  const modalContent = document.getElementById('modalContent') as HTMLDivElement;

  // Render Lucide icons
  // @ts-ignore
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  const showModal = () => {
    certificateModal.classList.remove('hidden');
    certificateModal.classList.add('flex');
  };

  const hideModal = () => {
    certificateModal.classList.add('hidden');
    certificateModal.classList.remove('flex');
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
    resultMessage.innerHTML = ''; // Clear previous message

    if (!code) {
      resultSection.classList.remove('hidden');
      resultSection.className = 'bg-red-100 border-l-4 border-red-400 p-4 mb-4 rounded';
      resultSection.setAttribute('role', 'alert');
      resultMessage.className = 'text-red-800 font-semibold flex items-center justify-center';
      resultMessage.innerHTML = `<span data-lucide="alert-circle" class="mr-2"></span> Por favor, insira um código de certificado.`;
      // @ts-ignore
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      return;
    }

    searchButton.disabled = true;
    searchButton.innerHTML = `<span data-lucide="loader" class="mr-2 animate-spin"></span> Verificando...`;
    // @ts-ignore
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    try {
      const response = await fetch(`/.netlify/functions/getCertificate?code=${code}`);
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.status === 404) {
        resultSection.classList.remove('hidden');
        resultSection.className = 'bg-red-100 border-l-4 border-red-400 p-4 mb-4 rounded';
        resultSection.setAttribute('role', 'alert');
        resultMessage.className = 'text-red-800 font-semibold flex items-center justify-center';
        resultMessage.innerHTML = `<span data-lucide="x-circle" class="mr-2"></span> Certificado não encontrado em nossa base de dados.`;
        // @ts-ignore
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
      
      const certificate = await response.json();

      if (certificate) {
        // Processar timestamp do Firestore
        let formattedTimestamp = 'Data não disponível';
        if (certificate.timestamp && certificate.timestamp._seconds) {
          const date = new Date(certificate.timestamp._seconds * 1000);
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

        modalContent.innerHTML = `
          <p class="flex items-center"><span data-lucide="tag" class="mr-2 text-green-700"></span><strong>Código:</strong> ${certificate.code}</p>
          <p class="flex items-center"><span data-lucide="user" class="mr-2 text-green-700"></span><strong>Nome:</strong> ${certificate.name}</p>
          <p class="flex items-center"><span data-lucide="calendar" class="mr-2 text-green-700"></span><strong>Evento:</strong> ${certificate.event}</p>
          <p class="flex items-center"><span data-lucide="user-check" class="mr-2 text-green-700"></span><strong>Criado por:</strong> ${certificate.createdBy}</p>
          <p class="flex items-center"><span data-lucide="clock" class="mr-2 text-green-700"></span><strong>Data de criação:</strong> ${formattedTimestamp}</p>
        `;
        showModal();
        resultSection.classList.remove('hidden');
        resultSection.className = 'bg-green-50 border-l-4 border-green-400 p-4 mb-4 rounded';
        resultSection.setAttribute('role', 'alert');
        resultMessage.className = 'text-green-800 font-semibold flex items-center justify-center';
        resultMessage.innerHTML = `<span data-lucide="check-circle" class="mr-2"></span> Certificado encontrado!`;
      }
    } catch (error) {
      console.error('Erro ao carregar ou verificar o certificado:', error);
      resultSection.classList.remove('hidden');
      resultSection.className = 'bg-red-100 border-l-4 border-red-400 p-4 mb-4 rounded';
      resultSection.setAttribute('role', 'alert');
      resultMessage.className = 'text-red-800 font-semibold flex items-center justify-center';
      resultMessage.innerHTML = `<span data-lucide="alert-triangle" class="mr-2"></span> Ocorreu um erro ao verificar o certificado. Tente novamente.`;
    } finally {
      searchButton.disabled = false;
      searchButton.innerHTML = `<span data-lucide="search" class="w-5 h-5"></span> Buscar`;
      // @ts-ignore
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
