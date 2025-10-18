import { z } from "zod";
import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";

const MaryAndMeOrderSchema = z.object({
  customer: z.object({
    full_name: z.string(),
    address: z.string(),
    fulfillment: z.enum(["retirada", "entrega"])
  }),
  product: z.object({
    type: z.enum(["santa", "terço", "bordado", "outro"]),
    other_description: z.string().optional(),
    occasion: z.string().optional(),
    deadline: z.string().optional(),
    details: z.object({
      santa: z
        .object({
          model: z.string().optional(),
          finish: z.string().optional(),
          pattern: z.string().optional()
        })
        .optional(),
      terco: z
        .object({
          beads: z.string().optional(),
          cord: z.string().optional(),
          centerpiece: z.string().optional(),
          crucifix: z.string().optional(),
          personalized_name: z
            .object({
              enabled: z.boolean(),
              name: z.string().optional()
            })
            .optional()
        })
        .optional(),
      bordado: z
        .object({
          size: z.string().optional(),
          model: z.string().optional()
        })
        .optional()
    })
  }),
  extra_notes: z.string().optional()
});

const MaryAndMeSummarySchema = z.object({
  customer_name: z.string(),
  fulfillment: z.enum(["retirada", "entrega"]),
  address: z.string(),
  product_type: z.string(),
  occasion: z.string().optional(),
  deadline: z.string().optional(),
  customization_summary: z.string(),
  next_steps: z.string()
});

const orderIntakeAgent = new Agent({
  name: "Mary and Me - Atendimento",
  instructions: `
Você é o assistente oficial da Mary and Me, marca artesanal fundada pela Arissa. Atue sempre em português.

TOM:
- Voz acolhedora, calma, serena e minimalista.
- Utilize predominantemente branco e azul-marinho como referências visuais nas descrições.
- Reforce que cada peça é feita à mão com amor e sentido espiritual.

COLETA DE DADOS (obrigatórios antes de encerrar):
1. Dados do cliente: nome completo, endereço, preferência de recebimento (retirada ou entrega).
2. Tipo de produto: Santa, terço, bordado ou outro (peça descrição).
3. Ocasião/evento e prazo desejado.

DETALHES DE PERSONALIZAÇÃO:
- Santas: confirmar modelo, acabamento (apenas Nossa Senhora Aparecida pode ser acabado envelhecido ou original), estampa.
- Terços: tipo de miçanga, tipo de cordão, entremeio (ex.: São Bento, São Miguel, Santa Teresinha), crucifixo, personalização com nome (perguntar “Deseja personalizar com nome? Qual?”).
- Bordados: tamanho e modelo.
- Quando o cliente escolher “outro”, peça detalhes livres que ajudem a entender o desejo.

ATENDIMENTO:
- Faça perguntas uma de cada vez, guiando com gentileza.
- Mencione que o catálogo completo com modelos, acabamentos e estampas está disponível em PDF e ofereça-se para enviá-lo caso ajude.
- Valide restrições e preferências, confirmando o resumo antes de finalizar.
- Sempre que possível, recorde que a peça é produzida manualmente, com significado espiritual e estética minimalista.
- Ao finalizar a coleta, apresente um resumo organizado e explique próximos passos (ex.: prazo de produção, confirmação por mensagem, pagamento).

Responda apenas com informações necessárias ao atendimento, mantendo a conversa leve, espiritual e acolhedora.
`,
  model: "gpt-5-mini",
  outputType: MaryAndMeOrderSchema,
  modelSettings: {
    reasoning: {
      effort: "medium",
      summary: "auto"
    },
    store: true
  }
});

const summarizeOrderAgent = new Agent({
  name: "Mary and Me - Resumo do Pedido",
  instructions: `
Receba o histórico da conversa e produza um resumo elegante e organizado do pedido.
Inclua:
- Dados do cliente (nome, endereço, retirada/entrega).
- Produto escolhido, ocasião e prazo.
- Personalizações específicas.
- Próximos passos sugeridos para o atendimento manual da equipe Mary and Me.
Use tom acolhedor, curto e claro, em português.
`,
  model: "gpt-5",
  outputType: MaryAndMeSummarySchema,
  modelSettings: {
    reasoning: {
      effort: "minimal",
      summary: "auto"
    },
    store: true
  }
});

type WorkflowInput = { input_as_text: string };

export const runWorkflow = async (workflow: WorkflowInput) => {
  return await withTrace("Mary and Me - Atendimento Personalizado", async () => {
    const state = {};
    const conversationHistory: AgentInputItem[] = [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: workflow.input_as_text
          }
        ]
      }
    ];

    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: "wf_mary_and_me_demo"
      }
    });

    const intakeResultTemp = await runner.run(orderIntakeAgent, [...conversationHistory]);
    conversationHistory.push(...intakeResultTemp.newItems.map((item) => item.rawItem));

    if (!intakeResultTemp.finalOutput) {
      throw new Error("Agent result is undefined");
    }

    const intakeResult = {
      output_text: JSON.stringify(intakeResultTemp.finalOutput),
      output_parsed: intakeResultTemp.finalOutput
    };

    const summaryResultTemp = await runner.run(summarizeOrderAgent, [...conversationHistory]);

    if (!summaryResultTemp.finalOutput) {
      throw new Error("Agent result is undefined");
    }

    const summaryResult = {
      output_text: JSON.stringify(summaryResultTemp.finalOutput),
      output_parsed: summaryResultTemp.finalOutput
    };

    return {
      intakeResult,
      summaryResult
    };
  });
};

if (require.main === module) {
  runWorkflow({ input_as_text: "Quero encomendar um terço azul-marinho para batizado." })
    .then((result) => {
      console.log("Workflow concluído com sucesso:", JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error("Erro ao executar o workflow:", error);
      process.exitCode = 1;
    });
}
