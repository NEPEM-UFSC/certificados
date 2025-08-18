# Certificados - Gerenciador e Validador

Este projeto é uma aplicação web para gerenciamento e validação de certificados. Ele permite que os usuários verifiquem a autenticidade de certificados emitidos, utilizando um código único associado a cada certificado.

## Funcionalidades

- **Validação de Certificados**: Verifique a autenticidade de certificados utilizando um código único.
- **Gerenciamento de Certificados**: Integração com Firebase Firestore para armazenar e gerenciar informações de certificados.
- **Interface Responsiva**: Design otimizado para dispositivos móveis e desktops.

## Tecnologias Utilizadas

- **Frontend**: Vite, TypeScript, Tailwind CSS
- **Backend**: Firebase Functions, Firebase Firestore
- **Hospedagem**: Netlify

## Estrutura do Projeto

- `src/`: Contém os arquivos principais do frontend, incluindo TypeScript e CSS.
- `netlify/functions/`: Contém as funções serverless para validação de certificados.
- `index.html`: Página principal da aplicação.
- `certificates.json`: Arquivo de exemplo com dados de certificados.

## Como Executar

1. Clone o repositório:
   ```bash
   git clone https://github.com/NEPEM-UFSC/certificados.git
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor de desenvolvimento:
   ```bash
   netlify dev
   ```
4. Acesse a aplicação em `http://localhost:3000`.

## Configuração do Firebase

Certifique-se de configurar as variáveis de ambiente no arquivo `.env`:

```
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_CLIENT_EMAIL=seu-email@projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
```

## Licença

Este projeto é licenciado sob a [MIT License](LICENSE).
