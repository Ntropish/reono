import { logger } from "./logger";
import UserRouter from "./routes/users/router";
import ErrorsRouter from "./routes/errors/router";

const App = () => {
  return (
    <use handler={logger}>
      <UserRouter />
      <ErrorsRouter />
    </use>
  );
};

export default App;
