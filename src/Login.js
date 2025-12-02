import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

function Login() {
  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <h2>Sign In</h2>
      <button 
        onClick={signInWithGoogle}
        style={{ 
          padding: "10px 20px", 
          fontSize: "16px", 
          backgroundColor: "#4285f4", 
          color: "white", 
          border: "none", 
          borderRadius: "5px",
          cursor: "pointer"
        }}
      >
        Sign in with Google
      </button>
    </div>
  );
}

export default Login;