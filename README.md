# API de Download de Mapas

Um serviço Node.js para gerenciar arquivos de mapas e recuperar metadados de mapas. Este serviço oferece suporte para upload, download e gerenciamento de mapas no formato MBTiles.

## Instalação

1. Clone o repositório:

   ```sh
   git clone <repository-url>
   ```

2. Navegue até o diretório do projeto:

   ```sh
   cd map-download-api
   ```

3. Instale as dependências:
   ```sh
   npm install
   ```

## Uso

Para iniciar o servidor de desenvolvimento:

```sh
npm run dev
```

Para compilar e iniciar o servidor de produção:

```sh
npm run build
npm start
```

```sh
npm run dev
```

Para compilar e iniciar o servidor de produção:

```sh
npm run build
npm start
```

A API estará disponível em `http://localhost:5045` (ou na PORTA configurada).

## Pontos de extremidade da API

### 1. Baixar o mapa

```
npm run build
npm start
```

A API estará disponível em `http://localhost:5045` (ou na PORTA configurada).

## Pontos de extremidade da API

### 1. Baixar o mapa

- **Ponto de extremidade**: `GET /map/:map_id/download`
- **Descrição**: Baixa o arquivo de mapa correspondente ao ID do mapa fornecido
- **Parâmetros**:
- `map_id`: O identificador exclusivo do mapa
- **Resposta**: Retorna o arquivo de mapa como `application/octet-stream`
- **Cabeçalhos**:
- `Content-Disposition`: attachment; filename=map-{map_id}.mbtiles
- `X-Request-ID`: Identificador exclusivo de solicitação para rastreamento

### 2. Obter metadados do mapa

- **Endpoint**: `GET /map/:map_id/metadata`
- **Description**: Retorna informações de metadados para o ID do mapa especificado
- **Parâmetros**:
- `map_id`: O identificador exclusivo do mapa
- **Resposta**: Objeto JSON contendo metadados do mapa
- **Cabeçalhos**:
- `X-Request-ID`: Identificador exclusivo de solicitação para rastreamento

## Variáveis ​​de ambiente

- `PORT`: Porta do servidor (padrão: 5045)
- `STORAGE_BASE_PATH`: Caminho base para armazenamento de mapas (padrão: src/archives/maps)

## Estrutura de armazenamento do mapa

```
archives/
maps/
{map_id}.mbtiles # Arquivos de blocos de mapa
metadata/
{map_id}.json # Arquivos de metadados do mapa
```

## Registro

Todas as solicitações são registradas com registro estruturado, incluindo:

- ID da solicitação para rastreamento
- Método e URL da solicitação
- Agente do usuário
- Registro específico da ação (início/progresso/conclusão do download, recuperação de metadados)
- Registro de erros com contexto detalhado

## Contribuição

Sinta-se à vontade para enviar problemas ou solicitações de melhorias.
