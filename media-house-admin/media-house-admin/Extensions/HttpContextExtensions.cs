using System.Security.Claims;

namespace MediaHouse.Extensions;

public static class HttpContextExtensions
{
    public static int? GetUserId(this Microsoft.AspNetCore.Http.HttpContext context)
    {
        var userIdClaim = context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
        {
            return null;
        }
        return userId;
    }
}
