FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["media-house-admin/media-house-admin.csproj", "media-house-admin/"]
RUN dotnet restore "media-house-admin/media-house-admin.csproj"
COPY . .
WORKDIR "/src/media-house-admin"
RUN dotnet build "media-house-admin.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "media-house-admin.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "media-house-admin.dll"]
