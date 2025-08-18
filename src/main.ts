import './styles.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <h1 class="text-2xl font-bold mb-6 text-center text-gray-800">Verificação de Certificados</h1>
  <div class="mb-4">
    <label for="certificateCode" class="block text-gray-700 text-sm font-bold mb-2">Código do Certificado:</label>
    <input type="text" id="certificateCode" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" placeholder="Insira o código aqui">
  </div>
  <button id="verifyButton" class="bg-green-700 hover:bg-green-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full flex items-center justify-center">
    <span data-lucide="check-circle" class="mr-2"></span>
    Verificar
  </button>
  <div id="result" class="mt-6 p-4 rounded-md text-center"></div>
`

document.addEventListener('DOMContentLoaded', () => {
  const verifyButton = document.getElementById('verifyButton') as HTMLButtonElement;
  const certificateCodeInput = document.getElementById('certificateCode') as HTMLInputElement;
  const resultDiv = document.getElementById('result') as HTMLDivElement;
  const certificateModal = document.getElementById('certificateModal') as HTMLDivElement;
  const closeModalButton = document.getElementById('closeModalButton') as HTMLButtonElement;
  const closeModalIcon = document.getElementById('closeModal') as HTMLButtonElement;
  const modalContent = document.getElementById('modalContent') as HTMLDivElement;

  // Render Lucide icons
  // @ts-ignore
  lucide.createIcons();

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

  verifyButton.addEventListener('click', async () => {
    const code = certificateCodeInput.value.trim();
    resultDiv.innerHTML = ''; // Clear previous results
    resultDiv.className = 'mt-6 p-4 rounded-md text-center'; // Reset class

    if (!code) {
      resultDiv.innerHTML = `<p class="text-red-600 flex items-center justify-center"><span data-lucide="alert-circle" class="mr-2"></span> Por favor, insira um código de certificado.</p>`;
      resultDiv.className = 'mt-6 p-4 rounded-md text-center bg-red-100 border border-red-400';
      // @ts-ignore
      lucide.createIcons();
      return;
    }

    verifyButton.disabled = true;
    verifyButton.innerHTML = `<span data-lucide="loader" class="mr-2 animate-spin"></span> Verificando...`;
    // @ts-ignore
    lucide.createIcons();

    try {
      const response = await fetch('/certificates.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const certificates = await response.json();

      const certificate = certificates.find((cert: any) => cert.code === code);

      if (certificate) {
        const formattedTimestamp = new Date(certificate.timestamp).toLocaleString('pt-BR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short'
        });

        modalContent.innerHTML = `
          <p class="flex items-center"><span data-lucide="tag" class="mr-2 text-green-700"></span><strong>Código:</strong> ${certificate.code}</p>
          <p class="flex items-center"><span data-lucide="user" class="mr-2 text-green-700"></span><strong>Nome:</strong> ${certificate.name}</p>
          <p class="flex items-center"><span data-lucide="calendar" class="mr-2 text-green-700"></span><strong>Evento:</strong> ${certificate.event}</p>
          <p class="flex items-center"><span data-lucide="pencil" class="mr-2 text-green-700"></span><strong>Criado por:</strong> ${certificate.createdBy}</p>
          <p class="flex items-center"><span data-lucide="calendar-check" class="mr-2 text-green-700"></span><strong>Data de Emissão:</strong> ${certificate.date}</p>
          <p class="flex items-center"><span data-lucide="clock" class="mr-2 text-green-700"></span><strong>Timestamp:</strong> ${formattedTimestamp}</p>
        `;
        showModal();
        resultDiv.innerHTML = `<p class="text-green-600 flex items-center justify-center"><span data-lucide="check-circle" class="mr-2"></span> Certificado encontrado!</p>`;
        resultDiv.className = 'mt-6 p-4 rounded-md text-center bg-green-100 border border-green-400';
      } else {
        resultDiv.innerHTML = `<p class="text-red-600 flex items-center justify-center"><span data-lucide="x-circle" class="mr-2"></span> Certificado não encontrado em nossa base de dados.</p>`;
        resultDiv.className = 'mt-6 p-4 rounded-md text-center bg-red-100 border border-red-400';
      }
    } catch (error) {
      console.error('Erro ao carregar ou verificar o certificado:', error);
      resultDiv.innerHTML = `<p class="text-red-600 flex items-center justify-center"><span data-lucide="alert-triangle" class="mr-2"></span> Ocorreu um erro ao verificar o certificado. Tente novamente.</p>`;
      resultDiv.className = 'mt-6 p-4 rounded-md text-center bg-red-100 border border-red-400';
    } finally {
      verifyButton.disabled = false;
      verifyButton.innerHTML = `<span data-lucide="check-circle" class="mr-2"></span> Verificar`;
      // @ts-ignore
      lucide.createIcons();
    }
  });
});
