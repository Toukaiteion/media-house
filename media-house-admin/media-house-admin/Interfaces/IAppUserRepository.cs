using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IAppUserRepository : IRepository<AppUser>
{
    Task<AppUser?> GetByUsernameAsync(string username);
    Task<AppUser?> GetByEmailAsync(string email);
}
