using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Deck.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class ButtonHotkey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Hotkey",
                table: "Buttons",
                type: "TEXT",
                maxLength: 60,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Buttons_Hotkey",
                table: "Buttons",
                column: "Hotkey",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Buttons_Hotkey",
                table: "Buttons");

            migrationBuilder.DropColumn(
                name: "Hotkey",
                table: "Buttons");
        }
    }
}
