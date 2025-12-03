import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { api } from './api';

function ChatPage({ user }) {
  const [inQueue, setInQueue] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [chatId, setChatId] = useState(null);
  const [chatPartner, setChatPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    console.log('🔌 Connecting to socket server...');
    socketRef.current = io('https://blahbluh.onrender.com');
    
    socketRef.current.on('connect', () => {
      console.log('✅ Connected to server with socket ID:', socketRef.current.id);
    });
    
    socketRef.current.on('chat-paired', (data) => {
      console.log('👥 Chat pairing received:', data);
      const partner = data.users.find(u => u.userId !== currentUserId);
      if (data.users.some(u => u.userId === currentUserId)) {
        console.log('✅ User matched! Partner:', partner);
        setChatId(data.chatId);
        setChatPartner(partner);
        setInQueue(false);
        console.log('🏠 Joining chat room:', data.chatId);
        socketRef.current.emit('join-chat', { userId: currentUserId, chatId: data.chatId });
      }
    });

    socketRef.current.on('new-message', (messageData) => {
      console.log('💬 New message received:', messageData);
      setMessages(prev => [...prev, messageData]);
    });

    return () => {
      console.log('🔌 Disconnecting from server...');
      socketRef.current?.disconnect();
    };
  }, [currentUserId]);

  const joinQueue = async () => {
    try {
      console.log('🔄 Attempting to join queue...');
      const response = await api.joinQueue(currentUserId, user.displayName);
      console.log('📝 Join queue response:', response);
      
      if (response.userId) {
        setCurrentUserId(response.userId);
        console.log('🆔 Using userId:', response.userId);
      }
      
      setInQueue(true);
      pollQueueStatus();
    } catch (error) {
      console.error('❌ Error joining queue:', error);
    }
  };

  const leaveQueue = async () => {
    try {
      console.log('🚪 Leaving queue for userId:', currentUserId);
      await api.leaveQueue(currentUserId);
      setInQueue(false);
      setQueuePosition(0);
      console.log('✅ Successfully left queue');
    } catch (error) {
      console.error('❌ Error leaving queue:', error);
    }
  };

  const pollQueueStatus = () => {
    console.log('📊 Starting queue status polling...');
    const interval = setInterval(async () => {
      try {
        const status = await api.getQueueStatus(currentUserId);
        console.log('📊 Queue status:', status);
        if (!status.inQueue) {
          clearInterval(interval);
          setInQueue(false);
          console.log('⏹️ Stopped polling - user no longer in queue');
        } else {
          setQueuePosition(status.queuePosition);
        }
      } catch (error) {
        console.error('❌ Error polling queue status:', error);
        clearInterval(interval);
      }
    }, 2000);
  };

  const sendMessage = () => {
    if (newMessage.trim() && chatId) {
      console.log('📤 Sending message:', newMessage, 'to chat:', chatId);
      socketRef.current.emit('send-message', {
        chatId,
        message: newMessage,
        userId: currentUserId,
        username: user.displayName
      });
      setNewMessage('');
    }
  };

  const startNewChat = () => {
    console.log('🔄 Starting new chat...');
    setChatId(null);
    setChatPartner(null);
    setMessages([]);
    setCurrentUserId(null);
  };

  if (chatId && chatPartner) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">Chatting with {chatPartner.username}</h1>
            <button 
              onClick={startNewChat}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium"
            >
              New Chat
            </button>
          </div>
        </div>
        
        <div className="flex flex-col h-[calc(100vh-80px)]">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.userId === currentUserId ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.userId === currentUserId 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-700 text-white'
                }`}>
                  <p className="text-sm font-medium">{msg.username}</p>
                  <p>{msg.message}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-4 border-t border-gray-700">
            <div className="flex space-x-4">
              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type your message..."
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button 
                onClick={sendMessage}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold">Random Chat</h1>
          <span className="text-sm">{user.displayName} {currentUserId && `(${currentUserId.slice(0,8)}...)`}</span>
        </div>
      </div>

      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-center">
          <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
          </div>
          
          {inQueue ? (
            <div>
              <h3 className="text-2xl font-semibold mb-2">Finding a chat partner...</h3>
              <p className="text-gray-400 mb-6">Position in queue: {queuePosition}</p>
              <button 
                onClick={leaveQueue}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium"
              >
                Leave Queue
              </button>
            </div>
          ) : (
            <div>
              <h3 className="text-2xl font-semibold mb-2">Ready to chat?</h3>
              <p className="text-gray-400 mb-6">Get paired with a random person for a chat</p>
              <button 
                onClick={joinQueue}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg font-medium"
              >
                Start Random Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatPage;