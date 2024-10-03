import { useState, useEffect } from 'react';
import { Send, Image, Loader2, Menu, X } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, getDocs, orderBy, onSnapshot, getDoc } from 'firebase/firestore';
import { firestore, auth } from '../firebase-config';
import { useNavigate } from 'react-router-dom';
import AIAgent from '../AIAgent';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from 'uuid';
import axios from '../axiosConfig';

const platforms = ['LinkedIn', 'Twitter', 'Facebook', 'Instagram'];

export default function Chat() {
  const [platform, setPlatform] = useState('LinkedIn');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [error, setError] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        console.log('User authenticated:', user.uid);
        fetchConversations();
      } else {
        console.log('No user authenticated, redirecting to login');
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const fetchConversations = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No user logged in');

      const q = query(
        collection(firestore, 'conversations'),
        where('userId', '==', user.uid),
        orderBy('lastUpdated', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const conversationsList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setConversations(conversationsList);
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError('Failed to fetch conversations. Please try again.');
    }
  };

  const handleSubmit = async (type) => {
    if (!input.trim()) return;

    setIsLoading(true);
    setError(null);
    
    const newUserMessage = { type: 'user', content: input, platform };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setInput('');

    try {
      let response;
      if (type === 'text') {
        response = await AIAgent.processUserInput(input, platform, currentConversationId);
        const newAssistantMessage = {
          type: 'assistant',
          content: response.text,
          platform
        };
        setMessages(prevMessages => [...prevMessages, newAssistantMessage]);
        if (!currentConversationId) {
          setCurrentConversationId(response.conversationId);
        }

        // Check if the AI is asking about image generation
        if (response.text.includes("Would you like to generate an image")) {
          // You might want to add a UI element here to let the user choose
          // For now, we'll assume the user always wants an image
          handleSubmit('image');
        }
      } else if (type === 'image') {
        response = await axios.post('/generate-image', 
          { platform, prompt: input, conversationId: currentConversationId },
          { headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } }
        );
        const newAssistantMessage = {
          type: 'assistant',
          content: response.data.generated_image,
          platform
        };
        setMessages(prevMessages => [...prevMessages, newAssistantMessage]);
        if (!currentConversationId) {
          setCurrentConversationId(response.data.conversationId);
        }
      }

      fetchConversations();
    } catch (err) {
      console.error('Error:', err);
      setError(`An error occurred while processing your request. ${err.response?.data?.error || err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setPlatform('LinkedIn');
    setIsSidebarOpen(false);
    AIAgent.resetConversation();
  };

  const loadConversation = async (conversation) => {
    if (conversation && conversation.id) {
      try {
        const conversationRef = doc(firestore, 'conversations', conversation.id);
        const conversationDoc = await getDoc(conversationRef);
        
        if (conversationDoc.exists()) {
          const data = conversationDoc.data();
          // Sort messages by timestamp to ensure correct order
          const sortedMessages = data.messages.sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
          setMessages(sortedMessages.map(msg => ({
            type: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text || msg.imageURL,
            platform: data.platform,
            timestamp: msg.timestamp.toDate() // Convert Firestore timestamp to JS Date
          })));
          setPlatform(data.platform || 'LinkedIn');
          setCurrentConversationId(conversation.id);
          setSelectedConversation(conversation);
          setIsSidebarOpen(false);
        } else {
          console.error('Conversation not found:', conversation.id);
          setError('Failed to load conversation. Please try again.');
        }
      } catch (err) {
        console.error('Error loading conversation:', err);
        setError('Failed to load conversation. Please try again.');
      }
    } else {
      console.error('Invalid conversation data:', conversation);
      setError('Failed to load conversation. Please try again.');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:relative md:translate-x-0`}>
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-4 border-b">
            <h2 className="text-xl font-semibold">Conversations</h2>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="p-4">
            <button
              onClick={startNewConversation}
              className="w-full py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-300"
            >
              New Conversation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-gray-500 text-center p-4">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv)}
                  className="p-4 border-b hover:bg-gray-100 cursor-pointer transition duration-300"
                >
                  <p className="font-medium truncate">
                    {conv.messages && conv.messages.length > 0 ? conv.messages[0].text : 'No messages'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {conv.lastUpdated ? new Date(conv.lastUpdated.seconds * 1000).toLocaleString() : 'Unknown date'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm p-4 flex justify-between items-center">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold text-center flex-1">
            {selectedConversation 
              ? `Conversation from ${new Date(selectedConversation.createdAt.seconds * 1000).toLocaleString()}`
              : 'Social Media Post Generator'}
          </h1>
          {selectedConversation && (
            <button
              onClick={startNewConversation}
              className="bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
            >
              New Conversation
            </button>
          )}
        </header>

        {/* Main chat area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-lg p-3 ${message.type === 'user' ? 'bg-blue-500 text-white' : 'bg-white shadow'}`}>
                <p className="font-semibold mb-1">{message.platform}</p>
                {message.content.startsWith('data:image') ? (
                  <img src={message.content} alt="Generated" className="mt-2 rounded-lg max-w-full h-auto" />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
                <p className="text-xs mt-2 text-gray-500">
                  {message.timestamp ? message.timestamp.toLocaleString() : 'Unknown time'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex space-x-2 mb-2 overflow-x-auto pb-2">
            {platforms.map(p => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-3 py-1 rounded-full text-sm flex-shrink-0 ${
                  platform === p ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your prompt here..."
              className="flex-1 p-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit('text')}
            />
            <button
              onClick={() => handleSubmit('text')}
              disabled={isLoading}
              className="bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
            <button
              onClick={() => handleSubmit('image')}
              disabled={isLoading}
              className="bg-purple-500 text-white p-2 rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Image className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
      {error && <div className="text-red-500 p-4 absolute bottom-0 left-0 right-0 bg-white">{error}</div>}
    </div>
  );
}