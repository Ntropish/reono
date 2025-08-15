import { logger } from "./logger";
import UserRouter from "./routes/users/router";

const App = () => {
  return (
    <use handler={logger}>
      <UserRouter />
    </use>
  );
};

export default App;

// runtime is now wired by adapter
