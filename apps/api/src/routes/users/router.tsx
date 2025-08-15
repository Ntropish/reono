import { z } from "zod";
import {
  getUser,
  updateUser,
  getAllUsers,
  deleteUser,
  createUser,
  userInputSchema,
} from "./repo";

export const UserRouter = () => {
  return (
    <router path="users">
      <get path="" handler={(c) => c.json(getAllUsers())} />
      <get
        path=":userId"
        validate={{ params: z.object({ userId: z.coerce.number() }) }}
        handler={(c) => c.json(getUser(c.params.userId))}
      />
      <put
        path=":userId"
        validate={{
          body: userInputSchema,
          params: z.object({ userId: z.coerce.number() }),
        }}
        handler={(c) => updateUser(c.params.userId, c.body)}
      />
      <delete
        path=":userId"
        validate={{ params: z.object({ userId: z.coerce.number() }) }}
        handler={(c) => deleteUser(c.params.userId)}
      />
      <post
        path=""
        validate={{ body: userInputSchema }}
        handler={(c) => createUser(c.body)}
      />
    </router>
  );
};

export default UserRouter;
