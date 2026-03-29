# Xdebug Profile Viewer

Transforme arquivos de profile do Xdebug/Cachegrind em insights acionaveis dentro do VS Code.

O **Xdebug Profile Viewer** abre seu profiler em uma interface visual, destaca hotspots, mostra risco de mudanca por funcao e ajuda voce a encontrar gargalos com rapidez.

## Funcionalidades

- Abre automaticamente arquivos de profiler em um editor visual somente leitura:
  - `cachegrind.out.*`
  - `*.out`
  - `*.cachegrind`
  - `*.cg`
- Tabela de hotspots com ordenacao por multiplas metricas.
- Metricas por funcao: CPU, memoria, medias por chamada, percentual self e criticidade.
- Painel detalhado com estrutura de chamadas:
  - callers (quem chama)
  - callees (quem e chamado)
  - fan-in, fan-out, risco e potencial de ganho
- Acao `Open source` para abrir arquivo e linha do codigo-fonte.
- CodeLens em arquivos PHP com indicador `Risco de quebra: X%` por funcao.
- Line Timings em PHP via Xdebug TRACE (inlay hints por linha/call-site).
- Interface localizada:
  - Portugues quando o idioma do VS Code comeca com `pt`
  - Ingles caso contrario

## Por que usar

- Encontre gargalos reais sem sair do editor.
- Priorize o que otimizar com base em impacto.
- Reduza risco de refatoracao com visao de acoplamento.
- Navegue do profile para o codigo com um clique.

## Como a extensao te ajuda no dia a dia

1. Voce gera um profile do Xdebug.
2. Abre o arquivo no VS Code.
3. O Viewer mostra os hotspots automaticamente.
4. Voce filtra funcoes, compara metricas e escolhe onde agir primeiro.
5. Usa `Open source` para ir direto ao ponto no codigo.
6. No PHP, os CodeLens mostram risco por funcao com base nos profiles indexados.
7. No PHP, os inlay hints de Line Timings mostram tempo por linha de chamada com dados de TRACE.

## Configuracoes principais

- `xdebugProfileViewer.pathMappings`
  - Mapeia caminhos do profile/trace (ex.: container) para caminhos locais.
- `xdebugProfileViewer.codeLens.enabled`
  - Liga/desliga os CodeLens de risco nos arquivos PHP.
- `xdebugProfileViewer.codeLens.profilerIndexDebounceMs`
  - Controla debounce na indexacao de novos profiles/traces.
- `xdebugProfileViewer.codeLens.profilerIndexRetryMs`
  - Define atraso para tentar indexar novamente arquivo ainda incompleto.
- `xdebugProfileViewer.codeLens.profilerIndexMaxRetries`
  - Define limite de novas tentativas de indexacao.
- `xdebugProfileViewer.lineTimings.enabled`
  - Liga/desliga os inlay hints de tempo por linha.
- `xdebugProfileViewer.lineTimings.minDurationMs`
  - Mostra hints apenas para linhas acima desse tempo total.
- `xdebugProfileViewer.lineTimings.showLoopsAsAggregate`
  - Mostra linhas repetidas como `total/count/avg`.
- `xdebugProfileViewer.lineTimings.maxHintsPerFile`
  - Limita a quantidade de hints por arquivo.
- `xdebugProfileViewer.lineTimings.traceGlobs`
  - Globs usados para localizar arquivos TRACE no workspace.
- `xdebugProfileViewer.lineTimings.lineRemapRadius`
  - Quantas linhas ao redor da linha original do trace procurar ao remapear hints depois de edicoes.

Exemplo de `pathMappings`:

```json
{
  "xdebugProfileViewer.pathMappings": {
    "/container/app": "/local/workspace/app"
  }
}
```

## Resolucao de codigo-fonte

Quando voce usa `Open source`, a extensao tenta:

1. `pathMappings` (maior prefixo correspondente primeiro)
2. resolucao direta de caminho absoluto/relativo
3. busca de fallback por sufixo dentro do workspace

Isso permite trabalhar com profiles/traces gerados em ambientes locais, remotos ou em containers.

## Line Timings (Trace)

`Line Timings` usa arquivos TRACE do Xdebug para anotar linhas de call-site direto no editor:

- Linha com uma chamada: `⏱ 3.4ms`
- Linha com multiplas chamadas: `⏱ total 183.2ms • 120x • avg 1.53ms`

Significado de `x`:

- `x` e a quantidade de chamadas de funcao atribuidas aquela linha no trace selecionado.
- Nao representa quantidade de declaracoes de funcao.

Interacao:

- Hover no hint mostra um resumo compacto:
  - tempo total da linha
  - delta total de memoria
  - quantidade de chamadas atribuidas a linha
  - timestamp do trace
- Clique no hint abre uma view dedicada (Webview), com:
  - totais da linha (`tempo`, `memoria`, `count`)
  - funcoes executadas naquela linha (X, Y, Z com total/count/media)
  - top chamadas individuais mais lentas

### Gerando TRACE no Xdebug

Exemplo de configuracao no `php.ini`:

```ini
xdebug.mode=trace
xdebug.start_with_request=yes
xdebug.trace_output_name=trace.%c
xdebug.output_dir=/tmp/xdebug
; Recomendado para esta extensao:
xdebug.trace_format=1
```

Notas:

- TRACE e mais detalhado (e mais pesado) que profiler/cachegrind. Use preferencialmente em desenvolvimento.
- Para maior compatibilidade de parsing, prefira formato tabular (`trace_format=1`).
- `pathMappings` tambem e aplicado aos caminhos do TRACE (ex.: `/container/app/...` -> workspace local).

## Requisitos

- VS Code `^1.109.0`

## Observacoes

- Os dados do Cachegrind sao agregados por funcao. Valores min/max por chamada dependem da origem.
- As colunas de CPU/memoria aparecem conforme os eventos detectados no arquivo.
