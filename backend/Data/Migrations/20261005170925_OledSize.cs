using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Deck.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class OledSize : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OledSize",
                table: "Decks",
                type: "TEXT",
                nullable: false,
                defaultValue: "normal");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OledSize",
                table: "Decks");
        }
    }
}
