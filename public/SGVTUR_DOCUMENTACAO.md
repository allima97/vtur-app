# Documentação do Sistema SGVTur

Este documento serve como ajuda oficial do sistema. Ele está organizado por tipo de usuário e por módulo, explicando as principais funções disponíveis. O que você vê no menu depende das permissões atribuídas ao seu usuário.

## Como usar esta ajuda
- Cada seção abaixo descreve o que é possível fazer em um módulo.
- Campos com * são obrigatórios.
- Botões de ação (como Editar, Excluir, Ver, Salvar) aparecem apenas quando sua permissão permite.
- Em tabelas, os botões de ação ficam na coluna Ações/Ver.

## Perfis de Usuário

## Vendedor

### Dashboard
- Acompanha indicadores do seu dia a dia (vendas, orçamentos, follow-up, consultorias e viagens próximas).
- Visualiza listas rápidas com ações de ver detalhes.

### Clientes (Carteira)
- Permite buscar clientes cadastrados pelo campo de busca.
- É possível adicionar um novo cliente pelo botão Adicionar cliente.
- Ao abrir o cadastro, os campos com * são obrigatórios.
- É possível classificar o cliente (A = Cliente frequente e fiel, B = Cliente frequente, mas não é fiel, C = Cliente pede informações na loja, só busca preço, D = Cliente só busca preço, E = Só perda de tempo) conforme o perfil de compra.
- Permite editar dados do cliente e acompanhar histórico de vendas/orçamentos do cliente.
- Permite cadastrar acompanhantes do cliente quando necessário.

### Vendas
- Consulta de vendas com filtros e busca por cliente, destino ou período.
- Cadastro de venda com informações do cliente, destino, valores e recibos.
- Edição de vendas quando permitido.
- Visualização de recibos e pagamentos vinculados.

### Importar Contratos
- Permite importar contratos/vendas em lote seguindo o layout esperado do sistema.
- Acesso pelo menu Vendas > Importar (quando habilitado).

### Orçamentos
- Consulta de orçamentos recentes.
- Criação de novos orçamentos quando permitido.
- Acompanhamento de status do orçamento.
- Acesso ao detalhamento do orçamento.

### Importar Orçamentos
- Envio em lote conforme o template disponível no módulo (quando habilitado).

### Consultoria Online
- Lista de consultorias com campo de busca.
- Ações disponíveis: editar consultoria, registrar interação e fechar consultoria.
- Consultorias fechadas não aparecem na lista principal, mas podem ser encontradas pela busca.

### Operação > Viagens
- Consulta da lista de viagens vinculadas ao vendedor.
- Acesso ao dossiê da viagem para ver detalhes, recibos e informações adicionais.
- Follow-up do cliente disponível após o embarque, quando liberado.

### Operação > Controle SAC
- Visualização dos SACs cadastrados.
- Filtros por status e período.
- Exportação para Excel e PDF quando habilitado.
- Botões na coluna Ações para Ver, Editar e Excluir aparecem conforme permissão, garantindo que apenas quem pode mexer no registro veja os controles adicionais e ainda acessa Histórico e Registrar interação.
- No mobile, o formulário permanece fechado até tocar em “Adicionar SAC” (ou editar um registro), evitando que campos ocupem a primeira tela sem necessidade.
- A coluna Ações continua exibindo Ver, Histórico, Registrar interação, Editar e Excluir em formato inline (até três botões por linha) no mobile, e a tabela aplica o mesmo layout de cards com bordas e fundo colorido que aparecem também no desktop.

### Comissionamento
- Visualiza comissão calculada conforme regras e vendas do período.

### Metas (quando habilitado)
- Visualiza as metas atribuídas pelo gestor.
- Não permite editar ou excluir metas, apenas consulta.

### Perfil
- Atualização dos seus dados de perfil.
- Visualização da sua escala em Perfil > Escala.

### Relatórios
- Relatório de vendas por destino (menu Relatórios > Vendas por destino) com filtros por destino, período e empresa do vendedor.
- Relatório de vendas por período e ranking podem ser usados para comparar destinos com a equipe.
- Relatório de vendas detalhado (menu Relatórios > Vendas > Detalhado) com filtros por destino, vendedor e status.
- Exemplo de teste para o vendedor: faça login como vendedor da empresa Alfa, abra o menu `Relatórios > Vendas por destino`, aplique o filtro de período (últimos 30 dias) e destino "Rio de Janeiro", abra a lista e verifique se os dados refletem apenas as vendas da sua empresa e é possível exportar o CSV.

### Relatórios > Vendas > Detalhado

- Possui filtros por cliente, por destino, por vendedor, por recibo e por status

### Relatórios > Vendas por Destino

Aplique o filtro de período (últimos 30 dias) e destino "Rio de Janeiro", abra a lista e verifique se os dados refletem apenas as vendas da sua empresa e é possível exportar o CSV.

## Gestor

### Tudo do Vendedor
- O gestor possui acesso às funções do vendedor, com visão ampliada para a equipe.

### Dashboard Gestor
- Indicadores e listas consolidadas da equipe.
- Follow-up e viagens com visão por equipe.

### Equipe (Parâmetros > Equipe)
- Cadastro e edição de usuários da equipe.
- Definição de horário de trabalho:
- Segunda à Sexta com opção de detalhar dias úteis.
- Sábado, Domingo e Feriados com horários próprios.
- Opção para atribuir automaticamente na escala.

### Importar Vendas
- Importação de vendas em lote via planilha Excel (.xlsx) conforme layout do sistema.
- Utilizado quando há migração de dados ou grande volume de registros.

### Metas (Parâmetros > Metas)
- Definição da meta geral da loja.
- Opção de gestor participar da meta.
- Dividir metas igualmente por vendedor ou definir metas individuais.
- Metas diferenciadas por produto (quando habilitado).
- Ativar ou inativar metas do período.

### Escalas (Parâmetros > Escalas)
- Visualização e ajuste da escala mensal da equipe.
- Visualização de feriados do mês e legenda de status.
- Atribuição automática de horários conforme parâmetros.

### Relatórios
- Relatório de vendas por período.
- Ranking de vendas.
- Relatórios por cliente, destino e produto.
- Relatório de vendas por destino (menu Relatórios > Vendas por destino) resumindo a equipe sob sua gestão e respeitando as empresas vinculadas ao gestor.
- Relatório de vendas detalhado (menu Relatórios > Vendas > Detalhado) mostra as métricas do time e garante que o “Precisa de ajuda?” carregue texto contextual.

### Relatórios > Vendas
- Nessa seção é possível você tem todas as informações sobre suas vendas, com produto, cliente, recibo, destino e muito mais.
- Aqui também você consegue ver o valor exata de sua comissão por produto, e gerar PDF ou exportar para o Excel ou csv.

### Cadastros
- Gestão de países, estados/províncias, cidades e destinos.
- Cadastro de produtos, circuitos, lotes e fornecedores.

### Parâmetros do Sistema
- Configuração de tipos de produto.
- Regras de comissão.
- Formas de pagamento.
- Câmbio.
- Configurações de orçamento e templates.
- Configuração de templates de comissões (quando disponível no menu).

### Fechamento de Comissão (quando habilitado)
- Consolidação e fechamento das comissões do período.

## Master

### Visão Multiempresa
- Acesso consolidado a dashboards e relatórios por empresa.
- Troca de empresa/filial quando disponível.

### Master > Empresas
- Cadastro e gestão das empresas do sistema.

### Master > Usuários
- Gestão de usuários entre empresas.

### Master > Permissões
- Configuração global de permissões por tipo de usuário.

### Relatórios
- Relatórios consolidados por empresa, incluindo o menu `Relatórios > Vendas por destino` com visão multiempresa e opção de trocar a empresa exibida.
- KPIs e dashboards são filtrados por `company_id` ou pelo master selection, garantindo que o master veja tanto os dados locais quanto o consolidado.
- O master também acessa o menu `Relatórios > Vendas > Detalhado` para validar os dados consolidados e oferecer ajuda contextualizada, evitando a mensagem “Ajuda ainda não cadastrada para este módulo”.

### Escalas e Parâmetros
- Acesso aos módulos de escala e parâmetros com visão master quando habilitado.

## Admin do Sistema

### Dashboard Admin
- Visão geral do ambiente e indicadores administrativos.

### Planos
- Gestão de planos e assinaturas.

### Financeiro
- Acompanhamento financeiro do sistema.

### Empresas
- Gestão administrativa das empresas.

### Usuários
- Gestão administrativa de usuários do sistema.

### Avisos
- Criação e manutenção de avisos globais.

### E-mail
- Configurações e templates de comunicação.

### Permissões
- Gestão das permissões globais do sistema.

### Logs
- Acesso a registros e auditoria.

### Documentação
- Acesso ao portal de documentação (este documento).

## Observações Importantes
- O acesso a cada módulo depende das permissões configuradas.
- Algumas opções podem aparecer somente para gestores, master ou admin.
- Caso você não enxergue uma função, verifique suas permissões com o gestor ou administrador.
