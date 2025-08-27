# API de Certificados - Documentação das Funções Serverless

## Visão Geral

Esta documentação descreve a API REST para o sistema de gerenciamento de certificados implementado como funções serverless na Netlify. A API utiliza Firebase Firestore como banco de dados e implementa autenticação baseada em JWT com sistema de roles.

### Base URL
```
https://seu-site.netlify.app/.netlify/functions/
```

### Autenticação

A API utiliza um sistema de autenticação baseado em JWT (JSON Web Tokens) com chaves armazenadas no Firestore. O processo funciona da seguinte forma:

1. **Token JWT**: Deve ser enviado no header `Authorization` como `Bearer <token>`
2. **Estrutura do Token**: O token deve conter um campo `keyId` no payload
3. **Validação**: A API busca a chave secreta no Firestore usando o `keyId` e valida a assinatura do token
4. **Autorização**: Verifica se a chave está ativa e se o role tem permissão para a operação

#### Estrutura do JWT Payload
```json
{
  "keyId": "string",
  "exp": 1234567890,
  "iat": 1234567890
}
```

### Sistema de Roles e Acesso Inicial

- **admin**: Acesso completo (criado manualmente no Firebase)
- **issuer**: Pode criar e ler certificados (criado por admin)
- **reader**: Apenas leitura de certificados (pode ser criado com token bootstrap)

#### Token Bootstrap - Acesso Público Limitado

O sistema inclui um **token bootstrap público** que permite criar apenas chaves `reader`:

```javascript
// Chave pública - distribuída com terminais
const BOOTSTRAP_SECRET = 'nepemcert-inicial-ufsc-2024';
const BOOTSTRAP_KEY_ID = 'nepemcert-bootstrap-2024';

// Qualquer usuário pode criar este token
const bootstrapToken = jwt.sign({
  keyId: BOOTSTRAP_KEY_ID,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 86400 // 24h
}, BOOTSTRAP_SECRET);
```

**Finalidade**: Permitir que novos usuários tenham acesso inicial mínimo sem precisar de aprovação prévia.

**Limitação**: Só pode criar chaves `reader` - não pode criar `issuer` ou `admin`.

---

## Endpoints

### 1. Criar Chave de API

Cria uma nova chave de acesso à API.

**Endpoint:** `POST /createKey`

**Autenticação:** 
- Para chaves `reader`: Token bootstrap (público) OU token admin/issuer
- Para chaves `issuer/admin`: Token admin (apenas)

#### Regras de Autorização Detalhadas

| Role Solicitado | Token Necessário | Quem Pode Criar |
|-----------------|------------------|-----------------|
| `reader` | Bootstrap (público) | Qualquer usuário |
| `reader` | Admin/Issuer | Admin ou Issuer |
| `issuer` | Admin | Apenas Admin |
| `admin` | Admin | Apenas Admin |

#### Exemplos de Uso por Cenário

**Novo usuário criando acesso inicial:**
```bash
# Token bootstrap (público)
curl -X POST https://seu-site.netlify.app/.netlify/functions/createKey \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlJZCI6Im5lcGVtY2VydC1ib290c3RyYXAtMjAyNCIsImlhdCI6MTYyMzMzNzIwMCwiZXhwIjoxNjIzMzQwODAwfQ.signature" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "reader",
    "isActive": true,
    "description": "Meu Terminal - João Silva"
  }'
```

**Admin criando chave privilegiada:**
```bash
# Token admin
curl -X POST https://seu-site.netlify.app/.netlify/functions/createKey \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "issuer",
    "isActive": true,
    "description": "Sistema de Eventos - Emissor Principal"
  }'
```

#### Responses Específicas

**201 Created (Reader com Bootstrap)**
```json
{
  "message": "Key created successfully",
  "id": "abc123def456",
  "description": "Meu Terminal - João Silva",
  "role": "reader",
  "isActive": true,
  "secret": "generated-secret-for-reader"
}
```

**403 Forbidden (Bootstrap tentando criar issuer)**
```json
{
  "message": "Forbidden: Bootstrap token can only create reader keys"
}
```

---

### 2. Criar Certificado

Cria um novo certificado no sistema.

**Endpoint:** `POST /writeCertificate`

**Autenticação:** Requerida (roles: `admin`, `issuer`)

#### Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "code": "string",
  "name": "string",
  "event": "string",
  "date": "string",
  "hours": "string",
  "description": "string"
}
```

#### Parâmetros

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `code` | string | Sim | Código único do certificado |
| `name` | string | Sim | Nome do participante |
| `event` | string | Sim | Nome do evento |
| `date` | string | Opcional | Data do evento |
| `hours` | string | Opcional | Carga horária |
| `description` | string | Opcional | Descrição adicional |

#### Responses

**201 Created**
```json
{
  "message": "Certificate created successfully",
  "id": "CERT001"
}
```

**400 Bad Request**
```json
{
  "message": "Missing required certificate data in request body"
}
```

**409 Conflict**
```json
{
  "message": "Certificate with this code already exists"
}
```

#### Exemplo de Uso

```bash
curl -X POST https://seu-site.netlify.app/.netlify/functions/writeCertificate \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "code": "CERT001",
    "name": "João Silva",
    "event": "Workshop de Programação",
    "date": "2024-01-15",
    "hours": "8",
    "description": "Participação completa no workshop"
  }'
```

---

### 3. Buscar Certificado

Busca um certificado pelo código.

**Endpoint:** `GET /getCertificate`

**Autenticação:** Não requerida (endpoint público)

#### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `code` | string | Sim | Código do certificado |

#### Responses

**200 OK**
```json
{
  "id": "CERT001",
  "code": "CERT001",
  "name": "João Silva",
  "event": "Workshop de Programação",
  "date": "2024-01-15",
  "hours": "8",
  "description": "Participação completa no workshop",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "createdBy": "key_id_123"
}
```

**400 Bad Request**
```json
{
  "message": "Missing \"code\" query parameter"
}
```

**404 Not Found**
```json
{
  "message": "Certificate not found"
}
```

#### Exemplo de Uso

```bash
curl -X GET "https://seu-site.netlify.app/.netlify/functions/getCertificate?code=CERT001"
```

---

### 4. Deletar Certificado

Remove um certificado do sistema.

**Endpoint:** `DELETE /deleteCertificate/{id}`

**Autenticação:** Requerida (role: `admin`)

#### Path Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `id` | string | Sim | ID do certificado a ser deletado |

#### Headers
```
Authorization: Bearer <jwt_token>
```

#### Responses

**200 OK**
```json
{
  "message": "Certificate deleted successfully"
}
```

**400 Bad Request**
```json
{
  "message": "Missing certificate ID"
}
```

**404 Not Found**
```json
{
  "message": "Certificate not found"
}
```

**403 Forbidden**
```json
{
  "message": "Forbidden: Role \"issuer\" not authorized for this operation"
}
```

#### Exemplo de Uso

```bash
curl -X DELETE https://seu-site.netlify.app/.netlify/functions/deleteCertificate/CERT001 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Códigos de Status HTTP

| Código | Descrição |
|--------|-----------|
| 200 | OK - Requisição bem-sucedida |
| 201 | Created - Recurso criado com sucesso |
| 400 | Bad Request - Dados inválidos na requisição |
| 401 | Unauthorized - Token inválido ou expirado |
| 403 | Forbidden - Sem permissão para a operação |
| 404 | Not Found - Recurso não encontrado |
| 405 | Method Not Allowed - Método HTTP não permitido |
| 409 | Conflict - Recurso já existe |
| 500 | Internal Server Error - Erro interno do servidor |

---

## Variáveis de Ambiente

Para o funcionamento correto das funções, as seguintes variáveis de ambiente devem ser configuradas no Netlify:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
```

---

## Estrutura do Banco de Dados (Firestore)

### Coleção: `keys`
```json
{
  "id": "auto-generated-id",
  "role": "admin|issuer|reader",
  "isActive": true,
  "secret": "jwt-secret-key",
  "createdAt": "timestamp"
}
```

### Coleção: `certificates`
```json
{
  "id": "certificate-code",
  "code": "CERT001",
  "name": "Nome do Participante",
  "event": "Nome do Evento",
  "date": "2024-01-15",
  "hours": "8",
  "description": "Descrição adicional",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "createdBy": "key-id-that-created-it"
}
```

---

## Exemplos de Implementação

### JavaScript/Node.js

```javascript
const jwt = require('jsonwebtoken');

// Função para criar JWT
function createJWT(keyId, secret) {
  const payload = {
    keyId: keyId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hora
  };
  
  return jwt.sign(payload, secret);
}

// Função para criar certificado
async function createCertificate(token, certificateData) {
  const response = await fetch('https://seu-site.netlify.app/.netlify/functions/writeCertificate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(certificateData)
  });
  
  return await response.json();
}

// Função para buscar certificado
async function getCertificate(code) {
  const response = await fetch(`https://seu-site.netlify.app/.netlify/functions/getCertificate?code=${code}`);
  return await response.json();
}
```

### Python

```python
import requests
import jwt
import json
from datetime import datetime, timedelta

class CertificatesAPI:
    def __init__(self, base_url):
        self.base_url = base_url
    
    def create_jwt(self, key_id, secret):
        payload = {
            'keyId': key_id,
            'iat': datetime.utcnow(),
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        return jwt.encode(payload, secret, algorithm='HS256')
    
    def create_certificate(self, token, certificate_data):
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        response = requests.post(
            f'{self.base_url}/writeCertificate',
            headers=headers,
            json=certificate_data
        )
        return response.json()
    
    def get_certificate(self, code):
        response = requests.get(
            f'{self.base_url}/getCertificate',
            params={'code': code}
        )
        return response.json()

# Uso
api = CertificatesAPI('https://seu-site.netlify.app/.netlify/functions')
token = api.create_jwt('your-key-id', 'your-secret')
result = api.create_certificate(token, {
    'code': 'CERT001',
    'name': 'João Silva',
    'event': 'Workshop de Programação'
})
```

---

## Tratamento de Erros

### Erros de Autenticação

```json
{
  "message": "Authentication failed: JWT expired",
  "error": "TokenExpiredError: jwt expired"
}
```

```json
{
  "message": "Authentication failed: Invalid JWT signature or malformed token",
  "error": "JsonWebTokenError: invalid signature"
}
```

### Erros de Validação

```json
{
  "message": "Invalid JSON body",
  "error": "Unexpected token in JSON at position 0"
}
```

### Erros de Autorização

```json
{
  "message": "Forbidden: API key is not active"
}
```

```json
{
  "message": "Forbidden: Role \"reader\" not authorized for this operation"
}
```

---

## Considerações de Segurança

1. **JWTs têm expiração**: Configure sempre um tempo de expiração adequado
2. **Chaves secretas**: Mantenha as chaves secretas seguras e rotacione-as periodicamente
3. **HTTPS**: Sempre use HTTPS em produção
4. **Validação de entrada**: Todos os inputs são validados antes do processamento
5. **Logs**: Erros são logados para auditoria

---

## Limitações e Considerações

1. **Rate Limiting**: As funções Netlify têm limites de execução e podem ser sujeitas a rate limiting
2. **Cold Start**: Primeira execução pode ser mais lenta devido ao cold start
3. **Timeout**: Funções têm timeout padrão de 10 segundos
4. **Tamanho do payload**: Limitado a ~6MB para requisições HTTP

---

## Suporte e Contato

Para questões técnicas ou suporte, entre em contato com a equipe de desenvolvimento do NEPEM-UFSC.

**Versão da API:** 0.5.0  
**Última atualização:** Agosto 2025

---

## Setup Inicial do Sistema

### 1. Chave Admin Manual (Uma vez apenas)

```javascript
// Criar manualmente no Firebase Console, coleção 'keys':
{
  role: 'admin',
  isActive: true,
  description: 'Administrador Principal - NEPEM UFSC',
  secret: 'sua-chave-secreta-admin-muito-segura',
  createdAt: /* timestamp atual */,
  createdBy: 'manual-setup'
}
```

### 2. Distribuição do Bootstrap

```javascript
// Este código pode ser distribuído publicamente:
const BOOTSTRAP_CONFIG = {
  keyId: 'nepemcert-bootstrap-2024',
  secret: 'nepemcert-inicial-ufsc-2024', // PÚBLICO
  maxRole: 'reader' // Limitação fixa
};

function createPublicAccessToken() {
  return jwt.sign({
    keyId: BOOTSTRAP_CONFIG.keyId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400
  }, BOOTSTRAP_CONFIG.secret);
}
```

### 3. Fluxo de Upgrade

```javascript
// Usuário solicita upgrade (processo fora da API)
const upgradeRequest = {
  currentKeyDescription: 'Meu Terminal - João Silva',
  currentKeyId: 'abc123def456',
  requestedRole: 'issuer',
  justification: 'Preciso emitir certificados para eventos da UFSC'
};

// Admin processa upgrade via API
async function processUpgrade(adminToken, request) {
  const response = await fetch(`/.netlify/functions/manageKey/${encodeURIComponent(request.currentKeyDescription)}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: request.requestedRole,
      description: `${request.currentKeyDescription} - ${request.requestedRole.toUpperCase()}`
    })
  });
  
  return await response.json();
}
```
