import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase-config';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const navigate = useNavigate();
  const googleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate('/chat');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="p-10 shadow-lg bg-white rounded-lg">
        <h1 className="text-2xl font-bold mb-5">Login to LynqAI</h1>
        <button
          onClick={googleSignIn}
          className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-700"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
};

export default Login;