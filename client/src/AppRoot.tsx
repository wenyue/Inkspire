import { BrowserRouter } from "react-router-dom";
import App from "./App";
import BackgroundMusic from "./components/BackgroundMusic";

export default function AppRoot() {
  return (
    <>
      <BackgroundMusic />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </>
  );
}
