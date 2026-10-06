import { UserRepository } from "./repository";

interface User {
  id: string;
  name: string;
}

class UserService {
  constructor(
    private repository: UserRepository
  ) {}

  async getUser(id: string): Promise<User> {
    return this.repository.findById(id);
  }
}

export function createService(repository: UserRepository) {
  return new UserService(repository);
}
