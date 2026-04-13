using MediaHouse.Data.Entities;
using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IFavorService
{
    Task<(List<FavorDto> Favorites, int TotalCount)> GetUserFavoritesAsync(int userId, int page, int pageSize);
    Task<bool> ToggleFavoriteAsync(int mediaId, int userId);
    Task<bool> IsFavoritedAsync(int mediaId, int userId);
}
