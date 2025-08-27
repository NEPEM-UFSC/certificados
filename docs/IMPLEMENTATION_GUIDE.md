# Guia de Implementação - API de Certificados

## Setup Inicial e Acesso Mínimo

### 1. Chave Bootstrap - Acesso Público Restrito

A chave bootstrap é uma **chave pública** que permite apenas criar chaves `reader`:

```javascript
const jwt = require('jsonwebtoken');

// Chave pública - pode ser distribuída em terminais
const BOOTSTRAP_KEY_ID = 'nepemcert-bootstrap-2024';
const BOOTSTRAP_SECRET = 'nepemcert-inicial-ufsc-2024'; // PÚBLICO, não é segredo

function createBootstrapToken() {
  return jwt.sign(
    { 
      keyId: BOOTSTRAP_KEY_ID,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 horas
    },
    BOOTSTRAP_SECRET
  );
}

// Qualquer usuário pode criar uma chave reader inicial
async function createInitialReaderKey() {
  const bootstrapToken = createBootstrapToken();
  
  const response = await fetch('/.netlify/functions/createKey', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bootstrapToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      isActive: true,
      description: 'Meu Terminal de Validação - João Silva'
    })
  });
  
  const readerKey = await response.json();
  console.log('✅ Chave reader criada:', readerKey);
  
  // IMPORTANTE: Salvar credentials localmente
  localStorage.setItem('myReaderKey', JSON.stringify({
    id: readerKey.id,
    secret: readerKey.secret,
    description: readerKey.description
  }));
  
  return readerKey;
}
```

### 2. Chave Admin Inicial - Criação Manual no Firebase

A primeira chave admin deve ser criada **manualmente** no Firebase:

```javascript
// Documento a ser criado manualmente na coleção 'keys' do Firestore:
{
  role: 'admin',
  isActive: true,
  description: 'Administrador Principal - NEPEM UFSC',
  secret: 'chave-secreta-admin-muito-segura-gerada-manualmente',
  createdAt: firestore.timestamp(), // Use o timestamp do Firebase
  createdBy: 'manual-setup'
}

// O ID do documento será o keyId usado nos JWTs
```

### 3. Fluxo de Acesso Completo

```javascript
class CertificateAccessFlow {
  constructor() {
    this.baseUrl = 'https://seu-site.netlify.app/.netlify/functions';
    this.BOOTSTRAP_SECRET = 'nepemcert-inicial-ufsc-2024'; // Público
  }
  
  // Passo 1: Usuário cria chave reader (acesso inicial)
  async createReaderAccess(userDescription) {
    const bootstrapToken = this.createBootstrapToken();
    
    const response = await fetch(`${this.baseUrl}/createKey`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bootstrapToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        isActive: true,
        description: userDescription
      })
    });
    
    const readerKey = await response.json();
    
    if (response.ok) {
      console.log('✅ Acesso reader criado:', readerKey.description);
      return readerKey;
    } else {
      throw new Error(`Erro ao criar acesso: ${readerKey.message}`);
    }
  }
  
  // Passo 2: Usar chave reader para validar certificados
  async validateCertificate(readerKey, certificateCode) {
    // Reader não precisa de auth para validar certificados (endpoint público)
    const response = await fetch(`${this.baseUrl}/getCertificate?code=${certificateCode}`);
    
    if (response.ok) {
      const certificate = await response.json();
      console.log('✅ Certificado válido:', certificate.name);
      return certificate;
    } else {
      const error = await response.json();
      console.log('❌ Certificado não encontrado:', error.message);
      return null;
    }
  }
  
  // Passo 3: Solicitar upgrade de permissões (processo manual)
  displayUpgradeRequest(readerKey) {
    console.log(`
📧 Para solicitar upgrade de permissões, envie as seguintes informações para o administrador:

Descrição da Chave: ${readerKey.description}
ID da Chave: ${readerKey.id}
Permissão Solicitada: issuer (para emitir certificados)
Justificativa: [Descreva o motivo da solicitação]

O administrador pode usar a função manageKey para atualizar suas permissões.
    `);
  }
  
  createBootstrapToken() {
    return jwt.sign(
      { 
        keyId: 'nepemcert-bootstrap-2024',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
      },
      this.BOOTSTRAP_SECRET
    );
  }
  
  createUserToken(keyId, secret) {
    return jwt.sign(
      { 
        keyId: keyId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8) // 8 horas
      },
      secret
    );
  }
}

// Exemplo de uso completo
async function newUserFlow() {
  const flow = new CertificateAccessFlow();
  
  try {
    // 1. Criar acesso inicial
    const readerKey = await flow.createReaderAccess('Terminal João Silva - Validador UFSC');
    
    // 2. Validar um certificado
    const certificate = await flow.validateCertificate(readerKey, 'WORKSHOP-2024-001');
    
    // 3. Se precisar de mais permissões
    if (!certificate) {
      console.log('Para emitir certificados, solicite upgrade:');
      flow.displayUpgradeRequest(readerKey);
    }
    
  } catch (error) {
    console.error('Erro no fluxo:', error.message);
  }
}
```

### 4. Administração - Upgrade de Permissões

```javascript
class AdminFlow {
  constructor(adminKeyId, adminSecret) {
    this.adminKeyId = adminKeyId;
    this.adminSecret = adminSecret;
    this.baseUrl = 'https://seu-site.netlify.app/.netlify/functions';
  }
  
  createAdminToken() {
    return jwt.sign(
      { 
        keyId: this.adminKeyId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
      },
      this.adminSecret
    );
  }
  
  // Listar solicitações de upgrade (chaves reader existentes)
  async listReaderKeys() {
    const token = this.createAdminToken();
    
    const response = await fetch(`${this.baseUrl}/createKey`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    const readerKeys = result.keys.filter(key => key.role === 'reader' && key.isActive);
    
    console.log('📋 Chaves reader disponíveis para upgrade:');
    readerKeys.forEach(key => {
      console.log(`- ${key.description} (ID: ${key.id})`);
    });
    
    return readerKeys;
  }
  
  // Fazer upgrade de reader para issuer
  async upgradeToIssuer(keyDescription, newDescription = null) {
    const token = this.createAdminToken();
    const encodedDescription = encodeURIComponent(keyDescription);
    
    const updates = {
      role: 'issuer'
    };
    
    if (newDescription) {
      updates.description = newDescription;
    }
    
    const response = await fetch(`${this.baseUrl}/manageKey/${encodedDescription}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ Upgrade realizado: ${keyDescription} → issuer`);
      return result;
    } else {
      throw new Error(`Erro no upgrade: ${result.message}`);
    }
  }
  
  // Criar chave issuer diretamente (sem passar por reader)
  async createDirectIssuer(description) {
    const token = this.createAdminToken();
    
    const response = await fetch(`${this.baseUrl}/createKey`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'issuer',
        isActive: true,
        description: description
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ Chave issuer criada: ${description}`);
      return result;
    } else {
      throw new Error(`Erro na criação: ${result.message}`);
    }
  }
}

// Exemplo de uso admin
async function adminExample() {
  // Usar credentials da chave admin criada manualmente no Firebase
  const admin = new AdminFlow('sua-admin-key-id-manual', 'chave-secreta-admin-muito-segura');
  
  // Listar chaves reader para possível upgrade
  const readerKeys = await admin.listReaderKeys();
  
  // Fazer upgrade de uma chave específica
  await admin.upgradeToIssuer('Terminal João Silva - Validador UFSC', 'João Silva - Emissor Autorizado');
  
  // Ou criar issuer diretamente
  await admin.createDirectIssuer('Sistema Principal de Eventos - Emissor Automático');
}
```

### 5. Segurança e Considerações

```javascript
// ✅ CORRETO: Bootstrap apenas para reader
const publicBootstrapFlow = {
  secret: 'nepemcert-inicial-ufsc-2024', // PODE ser público
  allowedRoles: ['reader'], // APENAS reader
  purpose: 'Acesso inicial mínimo para validação'
};

// ✅ CORRETO: Admin criado manualmente
const secureAdminFlow = {
  creation: 'Manual no Firebase Console',
  secret: 'chave-muito-segura-nunca-divulgada',
  allowedRoles: ['admin', 'issuer'], // Pode criar qualquer role
  purpose: 'Administração completa do sistema'
};

// ❌ INCORRETO: Bootstrap para admin/issuer
// const wrongBootstrapFlow = {
//   secret: 'nepemcert-inicial-ufsc-2024',
//   allowedRoles: ['admin', 'issuer'], // PERIGOSO!
//   purpose: 'Muito permissivo para chave pública'
// };
```

## Fluxo Típico de um Novo Usuário

1. **Download do terminal** → Contém bootstrap secret público
2. **Criar chave reader** → Usando bootstrap para acesso inicial  
3. **Validar certificados** → Funcionalidade básica disponível
4. **Solicitar upgrade** → Contato com admin para issuer
5. **Emitir certificados** → Após aprovação do admin

Este fluxo garante segurança enquanto permite acesso inicial sem barreiras.

## Variáveis de Ambiente Necessárias

Configure no Netlify:

```env
# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Bootstrap (para setup inicial)
NEPEMCERT_BOOTSTRAP_SECRET=sua-chave-secreta-muito-segura-para-bootstrap
```
