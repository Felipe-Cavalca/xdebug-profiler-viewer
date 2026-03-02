# Xdebug Profile Viewer

Transforme arquivos de profile do Xdebug/Cachegrind em insights acionáveis dentro do VS Code.

O **Xdebug Profile Viewer** abre seu profiler em uma interface visual, destaca hotspots, mostra risco de mudança por função e ajuda você a encontrar gargalos com rapidez.

## Funcionalidades

- Abre automaticamente arquivos de profiler em um editor visual somente leitura:
  - `cachegrind.out.*`
  - `*.out`
  - `*.cachegrind`
  - `*.cg`
- Tabela de hotspots com ordenação por múltiplas métricas.
- Métricas por função: CPU, memória, médias por chamada, percentual self e criticidade.
- Painel detalhado com estrutura de chamadas:
  - callers (quem chama)
  - callees (quem é chamado)
  - fan-in, fan-out, risco e potencial de ganho
- Ação `Open source` para abrir arquivo e linha do código-fonte.
- CodeLens em arquivos PHP com indicador `Risco de quebra: X%` por função.
- Interface localizada:
  - Português quando o idioma do VS Code começa com `pt`
  - Inglês caso contrário

## Por que usar

- Encontre gargalos reais sem sair do editor.
- Priorize o que otimizar com base em impacto.
- Reduza risco de refatoração com visão de acoplamento.
- Navegue do profile para o código com um clique.

## Como a extensão te ajuda no dia a dia

1. Você gera um profile do Xdebug.
2. Abre o arquivo no VS Code.
3. O Viewer mostra os hotspots automaticamente.
4. Você filtra funções, compara métricas e escolhe onde agir primeiro.
5. Usa `Open source` para ir direto ao ponto no código.
6. No PHP, os CodeLens mostram risco por função com base nos profiles indexados.

## Configurações principais

- `xdebugProfileViewer.pathMappings`
  - Mapeia caminhos do profile (ex.: container) para caminhos locais.
- `xdebugProfileViewer.codeLens.enabled`
  - Liga/desliga os CodeLens de risco nos arquivos PHP.
- `xdebugProfileViewer.codeLens.profilerIndexDebounceMs`
  - Controla debounce na indexação de novos profiles.
- `xdebugProfileViewer.codeLens.profilerIndexRetryMs`
  - Define atraso para tentar indexar novamente arquivo ainda incompleto.
- `xdebugProfileViewer.codeLens.profilerIndexMaxRetries`
  - Define limite de novas tentativas de indexação.

Exemplo de `pathMappings`:

```json
{
  "xdebugProfileViewer.pathMappings": {
    "/container/app": "/local/workspace/app"
  }
}
```

## Resolução de código-fonte

Quando você usa `Open source`, a extensão tenta:

1. `pathMappings` (maior prefixo correspondente primeiro)
2. resolução direta de caminho absoluto/relativo
3. busca de fallback por sufixo dentro do workspace

Isso permite trabalhar com profiles gerados em ambientes locais, remotos ou em containers.

## Requisitos

- VS Code `^1.109.0`

## Observações

- Os dados do Cachegrind são agregados por função. Valores min/max por chamada dependem da origem.
- As colunas de CPU/memória aparecem conforme os eventos detectados no arquivo.
