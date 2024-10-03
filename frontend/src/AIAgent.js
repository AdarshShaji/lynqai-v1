import axios from './axiosConfig';
import { auth } from './firebase-config';

class AIAgent {
  constructor() {
    this.conversationHistory = [];
    this.currentStage = 'greeting';
  }

  async processUserInput(userInput, platform, conversationId) {
    console.log('Processing user input:', userInput);
    console.log('Platform:', platform);
    console.log('Conversation ID:', conversationId);

    this.conversationHistory.push({ role: 'user', content: userInput });

    const systemMessage = this.constructSystemMessage(platform);
    const userMessage = this.constructUserMessage(userInput);

    console.log('System Message:', systemMessage);
    console.log('User Message:', userMessage);

    try {
      const token = await auth.currentUser?.getIdToken();
      console.log('Got auth token');

      const response = await axios.post('/generate-text', 
        { 
          platform, 
          systemMessage,
          userMessage,
          conversationId,
          wordCount: 50
        },
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Received response:', response.data);

      let aiResponse = response.data.generated_text;
      aiResponse = this.postProcessResponse(aiResponse, platform);

      console.log('Processed AI response:', aiResponse);

      this.conversationHistory.push({ role: 'assistant', content: aiResponse });
      this.updateConversationStage(aiResponse, userInput);

      return {
        text: aiResponse,
        conversationId: response.data.conversationId
      };
    } catch (error) {
      console.error('Error in processing:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        console.error('Error status:', error.response.status);
      }
      throw error;
    }
  }

  constructSystemMessage(platform) {
    return `You are Sam, a professional Content Strategist for ${platform}. Provide concise, actionable advice for creating engaging posts. Use a friendly, professional tone. Limit responses to 50 words.`;
  }

  constructUserMessage(userInput) {
    return `User's request: "${userInput}"

Respond as Sam, the ${this.platform} Content Strategist. Provide specific, actionable advice related to the user's input.`;
  }

  postProcessResponse(response, platform) {
    // Remove any part that looks like it's repeating the prompt
    response = response.replace(/^(Sam:|As a professional Content Strategist for [^,]+,)/, '').trim();

    // Ensure the response starts with an appropriate introduction
    if (!response.startsWith("Here's my advice:")) {
      response = `Here's my advice: ${response}`;
    }

    // Truncate to 50 words if it's too long
    const words = response.split(/\s+/);
    if (words.length > 50) {
      response = words.slice(0, 50).join(' ') + '...';
    }

    // Ensure the response ends with proper punctuation
    if (!/[.!?]$/.test(response)) {
      response += '.';
    }

    return response;
  }

  updateConversationStage(aiResponse, userInput) {
    // ... (keep the existing implementation)
  }

  resetConversation() {
    this.conversationHistory = [];
    this.currentStage = 'greeting';
  }
}

const aiAgent = new AIAgent();
export default aiAgent;