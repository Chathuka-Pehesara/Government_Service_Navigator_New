FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/src/Government_Service_Navigator.Backend.csproj backend/src/
COPY agentic-ai/AgenticAi.csproj agentic-ai/
RUN dotnet restore backend/src/Government_Service_Navigator.Backend.csproj

COPY backend/ backend/
COPY agentic-ai/ agentic-ai/
RUN dotnet publish backend/src/Government_Service_Navigator.Backend.csproj \
    -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .
COPY backend/src/Data/KnowledgeDocuments ./Data/KnowledgeDocuments

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

USER $APP_UID
ENTRYPOINT ["dotnet", "Government_Service_Navigator.Backend.dll"]
