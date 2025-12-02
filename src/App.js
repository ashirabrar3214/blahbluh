import './App.css';
import Login from './Login';
import ChatPage from './ChatPage';
import { useState, useEffect } from 'react';
import { auth } from './firebase';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
          <p>Loading...</p>
        </header>
      </div>
    );
  }

  if (user) {
    return <ChatPage user={user} />;
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome!</h1>
        <p>Welcome to our React application</p>
        <Login />
      </header>
    </div>
  );
}

export default App;
