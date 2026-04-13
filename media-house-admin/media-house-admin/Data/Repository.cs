using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data;

public class Repository<T>(MediaHouseDbContext context, ILogger<Repository<T>> logger) : Interfaces.IRepository<T> where T : class
{
    protected readonly MediaHouseDbContext _context = context;
    protected readonly ILogger<Repository<T>> _logger = logger;
    protected readonly DbSet<T> _dbSet = context.Set<T>();

    public virtual async Task<T?> GetByIdAsync(string id)
    {
        try
        {
            return await _dbSet.FindAsync(id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting entity by id: {Id}", id);
            throw;
        }
    }

    public virtual async Task<List<T>> GetAllAsync()
    {
        try
        {
            return await _dbSet.ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all entities");
            throw;
        }
    }

    public virtual async Task<T> CreateAsync(T entity)
    {
        try
        {
            _dbSet.Add(entity);
            await _context.SaveChangesAsync();

            _logger.LogDebug("Created entity of type {EntityType}", typeof(T).Name);
            return entity;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating entity of type {EntityType}", typeof(T).Name);
            throw;
        }
    }

    public virtual async Task<T> UpdateAsync(T entity)
    {
        try
        {
            _dbSet.Update(entity);
            await _context.SaveChangesAsync();

            _logger.LogDebug("Updated entity of type {EntityType}", typeof(T).Name);
            return entity;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating entity of {EntityType}", typeof(T).Name);
            throw;
        }
    }

    public virtual async Task<bool> DeleteAsync(string id)
    {
        try
        {
            var entity = await _dbSet.FindAsync(id);
            if (entity == null)
            {
                _logger.LogWarning("Entity not found for deletion with id: {Id}", id);
                return false;
            }

            _dbSet.Remove(entity);
            await _context.SaveChangesAsync();

            _logger.LogDebug("Deleted entity of type {EntityType} with id: {Id}", typeof(T).Name, id);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting entity with id: {Id}", id);
            throw;
        }
    }

    public virtual async Task<List<T>> FindAsync(System.Linq.Expressions.Expression<System.Func<T, bool>> predicate)
    {
        try
        {
            return await _dbSet.Where(predicate).ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error finding entities with predicate");
            throw;
        }
    }
}
