const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { firestore, storage } = require('./firebase-config');
const verifyToken = require('./authMiddleware');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Increase the payload size limit (e.g., to 50mb)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3001', // Frontend URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}));

app.use(bodyParser.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

// Text Generation Endpoint
app.post('/generate-text', verifyToken, async (req, res) => {
  console.log('Received request for text generation');
  const { systemMessage, userMessage, platform, conversationId, wordCount } = req.body;
  console.log('System Message:', systemMessage);
  console.log('User Message:', userMessage);
  console.log('Platform:', platform);
  console.log('Conversation ID:', conversationId);

  try {
    console.log('Sending request to Hugging Face API');
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
      { 
        inputs: `${systemMessage}\n\n${userMessage}\n\nSam:`,
        parameters: {
          max_new_tokens: 100,
          return_full_text: false,
          do_sample: true,
          temperature: 0.7,
          top_p: 0.95
        }
      },
      { headers: { Authorization: `Bearer ${process.env.HUGGING_FACE_API_KEY}` } }
    );

    console.log('Received response from Hugging Face API');
    let generatedText = response.data[0].generated_text;

    // Extract the relevant part of the response
    const samIndex = generatedText.indexOf("Sam:");
    if (samIndex !== -1) {
      generatedText = generatedText.substring(samIndex + 4).trim();
    }

    // Ensure the response is complete and within the word limit
    generatedText = ensureCompleteResponse(generatedText);
    generatedText = limitToWordCount(generatedText, wordCount || 50);

    // Combine with previous response if any
    if (previousResponse) {
      generatedText = previousResponse + generatedText;
    }

    // Ensure the response is complete
    const lastSentenceMatch = generatedText.match(/[^.!?]+[.!?](?:\s|$)(?!.*[.!?])/);
    if (lastSentenceMatch) {
      generatedText = generatedText.slice(0, lastSentenceMatch.index + lastSentenceMatch[0].length).trim();
    }

    const isComplete = generatedText.split(' ').length >= wordCount;

    console.log('Saving conversation to Firestore');
    let conversationRef;
    const now = new Date();

    if (conversationId) {
      console.log('Updating existing conversation:', conversationId);
      conversationRef = firestore.collection('conversations').doc(conversationId);
      await conversationRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(
          {
            messageId: uuidv4(),
            sender: 'user',
            text: prompt,
            timestamp: now
          },
          {
            messageId: uuidv4(),
            sender: 'assistant',
            text: generatedText,
            timestamp: now
          }
        ),
        lastUpdated: now
      });
    } else {
      console.log('Creating new conversation');
      conversationRef = await firestore.collection('conversations').add({
        userId: req.user.uid,
        messages: [
          {
            messageId: uuidv4(),
            sender: 'user',
            text: prompt,
            timestamp: now
          },
          {
            messageId: uuidv4(),
            sender: 'assistant',
            text: generatedText,
            timestamp: now
          }
        ],
        platform,
        createdAt: now,
        lastUpdated: now
      });
    }

    console.log('Sending response to client');
    res.json({ 
      generated_text: generatedText, 
      conversationId: conversationRef.id,
      isComplete: isComplete
    });
  } catch (error) {
    console.error('Error generating text:', error);
    if (error.response) {
      console.error('Error response from Hugging Face API:', error.response.data);
      console.error('Error status:', error.response.status);
      console.error('Error headers:', error.response.headers);
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error setting up request:', error.message);
    }
    res.status(500).json({ error: 'Failed to generate text.', details: error.message });
  }
});

function ensureCompleteResponse(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.join(' ').trim();
}

function limitToWordCount(text, limit) {
  const words = text.split(/\s+/);
  return words.slice(0, limit).join(' ');
}

// Image Generation Endpoint
app.post('/generate-image', verifyToken, async (req, res) => {
  const { prompt, platform, conversationId } = req.body;

  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
      { inputs: `Generate a ${platform} image: ${prompt}` },
      { 
        headers: { Authorization: `Bearer ${process.env.HUGGING_FACE_API_KEY}` },
        responseType: 'arraybuffer'
      }
    );

    // Convert the image to base64
    const base64Image = Buffer.from(response.data).toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64Image}`;

    // Save the conversation in Firestore
    let conversationRef;
    const now = new Date();

    if (conversationId) {
      conversationRef = firestore.collection('conversations').doc(conversationId);
      await conversationRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(
          {
            messageId: uuidv4(),
            sender: 'user',
            text: prompt,
            timestamp: now
          },
          {
            messageId: uuidv4(),
            sender: 'assistant',
            imageURL: imageUrl,
            timestamp: now
          }
        ),
        lastUpdated: now
      });
    } else {
      conversationRef = await firestore.collection('conversations').add({
        userId: req.user.uid,
        messages: [
          {
            messageId: uuidv4(),
            sender: 'user',
            text: prompt,
            timestamp: now
          },
          {
            messageId: uuidv4(),
            sender: 'assistant',
            imageURL: imageUrl,
            timestamp: now
          }
        ],
        platform,
        createdAt: now,
        lastUpdated: now
      });
    }

    res.json({ generated_image: imageUrl, conversationId: conversationRef.id });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Failed to generate image.', details: error.message });
  }
});

// New endpoint to add a message to an existing conversation
app.post('/add-message', verifyToken, async (req, res) => {
  const { conversationId, message } = req.body;

  try {
    const conversationRef = firestore.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const newMessage = {
      messageId: uuidv4(),
      sender: message.sender,
      text: message.text || "",
      imageURL: message.imageURL || null,
      timestamp: new Date()
    };

    await conversationRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(newMessage),
      lastUpdated: new Date()
    });

    res.json({ success: true, message: 'Message added successfully' });
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ error: 'Failed to add message', details: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});