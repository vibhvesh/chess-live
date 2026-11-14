import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Game from "./pages/Game.jsx";
import ComputerGame from "./pages/ComputerGame.jsx";
import Review from "./pages/Review.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/g/:hostId" element={<Game />} />
      <Route path="/c/:gameId" element={<ComputerGame />} />
      <Route path="/r/*" element={<Review />} />
    </Routes>
  );
}
