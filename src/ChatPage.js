import { signOut } from "firebase/auth";
import { auth } from "./firebase";

function ChatPage({ user }) {
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1>Chat with Users</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={user.photoURL} alt="Profile" style={{ borderRadius: "50%", width: "40px" }} />
          <span>{user.displayName}</span>
          <button onClick={handleSignOut} style={{ padding: "5px 10px" }}>
            Sign Out
          </button>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: "100px", color: "#666" }}>
        <p>Chat functionality coming soon...</p>
      </div>
    </div>
  );
}

export default ChatPage;