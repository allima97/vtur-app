# Resumo Executivo - Novo Sistema de Templates

## 🎯 O Que Estamos Construindo

Um sistema de **templates visuais de mensagens** onde:
1. O designer cria uma **imagem de fundo** com áreas específicas VAZIAS
2. O sistema **preenche automaticamente** essas áreas com texto
3. Usuários podem **personalizar mensagens** sem precisar editar imagens

## 📊 Visual do Template (1080x1080px)

```
┌─────────────────────────────────────────────────────────────────┐
│  🎈                                                   ✈️          │
│       🎈                                                        │
│                                                                 │
│         ┌─────────────────────────────────────┐                 │
│         │                                     │                 │
│         │     ÁREA VAZIA - TÍTULO             │  ← Sistema      │
│         │     (100px altura)                  │    insere:      │
│         │                                     │    "Feliz       │
│         └─────────────────────────────────────┘    Aniversário!" │
│                                                                 │
│         ┌─────────────────────────────────────┐                 │
│         │                                     │                 │
│         │     ÁREA VAZIA - NOME CLIENTE       │  ← Sistema      │
│         │     (80px altura)                   │    insere:      │
│         │                                     │    "Prezado(a)  │
│         └─────────────────────────────────────┘    João"        │
│                                                                 │
│         ┌─────────────────────────────────────┐                 │
│         │                                     │                 │
│         │     ÁREA VAZIA - MENSAGEM           │  ← Sistema      │
│         │     (300px altura)                  │    insere       │
│         │                                     │    texto        │
│         │                                     │    digitado     │
│         │                                     │    pelo         │
│         │                                     │    usuário      │
│         │                                     │                 │
│         └─────────────────────────────────────┘                 │
│                                                                 │
│  ┌─────────────────────────┐                                    │
│  │                         │                           🧳       │
│  │   ÁREA VAZIA            │                         ┌────┐     │
│  │   - ASSINATURA          │                         │LOGO│     │  ← Logo
│  │   (120px altura)        │                         │120x│     │    empresa
│  │                         │                         │120 │     │    inserido
│  │   "Com carinho,         │                         └────┘     │    pelo
│  │    Maria                │                                    │    sistema
│  │    Consultora"          │                                    │
│  │                         │                                    │
│  └─────────────────────────┘                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
     ↑
  Canto inferior esquerdo                    Canto inferior direito
```

## 🎨 Template de Aniversário - O Que Precisamos

### Elementos Visuais (O Designer Cria)

| Elemento | Posição | Tamanho | Descrição |
|----------|---------|---------|-----------|
| 🎈 Balões | Cantos superiores | Variado | 3-5 balões coloridos |
| ✈️ Avião | Canto superior direito | 60-80px | Silhueta discreta "voando" |
| 🧳 Mala | Canto inferior | 80-100px | Mala de viagem pequena |
| Fundo | Todo o card | 1080x1080 | Gradiente suave (rosa/amarelo claro) |

### Áreas VAZIAS (O Sistema Preenche)

| Área | Posição | Dimensões | Conteúdo |
|------|---------|-----------|----------|
| Título | Topo centro | 800x100px | "Feliz Aniversário!" |
| Saudação | Centro-superior | 800x80px | "Prezado(a) [Nome]" |
| Mensagem | Centro | 800x300px | Texto personalizado |
| Assinatura | Inferior esquerdo | 400x120px | Nome + cargo do consultor |
| Logo | Inferior direito | 120x120px | Logo da empresa |

## 🏢 Hierarquia de Acesso

```
┌─────────────────────────────────────────────────────────────┐
│  ADMIN (Sistema)                                            │
│  └── Cria templates para TODOS                              │
│       Ex: "Aniversário Padrão"                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  MASTER (Empresa)                                           │
│  └── Vê templates do Admin                                  │
│  └── Cria templates para sua empresa                        │
│       Ex: "Aniversário Empresa X"                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  GESTOR (Equipe)                                            │
│  └── Vê templates do Master + Admin                         │
│  └── Cria templates para sua equipe                         │
│       Ex: "Aniversário Equipe Sul"                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  VENDEDOR (Individual)                                      │
│  └── Vê todos os templates acima                            │
│  └── Cria templates pessoais                                │
│       Ex: "Meu Aniversário Personalizado"                   │
└─────────────────────────────────────────────────────────────┘
```

## ✅ Checklist para o Designer

### Antes de Começar
- [ ] Recebeu o briefing completo? (`TEMPLATE_ANIVERSARIO_BRIEFING_DESIGNER.md`)
- [ ] Entendeu que as áreas de texto devem ficar VAZIAS?
- [ ] Confirmou as dimensões (1080x1080px)?

### Durante a Criação
- [ ] Elementos decorativos apenas nas bordas?
- [ ] Margem de 80px das áreas de texto respeitada?
- [ ] Fundo permite leitura de texto branco E preto?
- [ ] Nenhum texto adicionado à imagem?
- [ ] Nenhuma caixa ou marcação de posição?

### Antes de Entregar
- [ ] Arquivo em PNG ou JPG máxima qualidade?
- [ ] Arquivo editável (AI/Figma) incluído?
- [ ] Preview com texto de exemplo (apenas para demonstração)?
- [ ] Nome do arquivo: `template-aniversario-v1.png`?

## 📁 Entregáveis do Projeto

### Documentação Criada
1. `TEMPLATES_SISTEMA_ESPECIFICACAO.md` - Especificação técnica completa
2. `TEMPLATE_ANIVERSARIO_BRIEFING_DESIGNER.md` - Briefing para designer
3. `TEMPLATES_IMPLEMENTACAO.md` - Guia de implementação técnica
4. `database/migrations/20260324_templates_hierarquia_v2.sql` - Migration do banco

### Próximos Passos

| Etapa | Responsável | Status |
|-------|-------------|--------|
| Criar template de Aniversário | Designer | ⏳ Pendente |
| Implementar APIs backend | Desenvolvedor | ⏳ Pendente |
| Criar componentes frontend | Desenvolvedor | ⏳ Pendente |
| Testar hierarquia | QA | ⏳ Pendente |
| Criar templates adicionais | Designer | ⏳ Futuro |

## 🎨 Paleta de Cores Sugerida (Aniversário)

```css
/* Opção 1: Alegre e Vibrante */
--cor-primaria: #FF6B9D;     /* Rosa pink */
--cor-secundaria: #FFD93D;   /* Amarelo ouro */
--cor-destaque: #6BCB77;     /* Verde menta */
--cor-fundo-start: #FFF5F7;  /* Rosa bem claro */
--cor-fundo-end: #FFFFFF;    /* Branco */

/* Texto (sistema vai usar) */
--cor-texto: #1D2744;        /* Azul escuro */
```

## 📞 Dúvidas Frequentes

**Q: Posso colocar texto "Feliz Aniversário" como exemplo?**
R: Não! O template deve ter áreas completamente vazias. O sistema insere o texto automaticamente.

**Q: E se eu quiser indicar onde vai o texto?**
R: Não use caixas ou marcações. O sistema sabe as coordenadas exatas (definidas no banco de dados).

**Q: O logo da CVC deve estar na imagem?**
R: Não! O sistema insere o logo dinamicamente. Cada empresa terá seu próprio logo.

**Q: Posso usar fotos reais?**
R: Não recomendado. Use ilustrações vetoriais para melhor qualidade e consistência.

**Q: E se o texto não couber?**
R: O sistema trunca automaticamente. Mas o designer deve garantir que as áreas são suficientemente grandes.

---

**Última atualização**: 24/03/2026
**Versão**: 1.0
