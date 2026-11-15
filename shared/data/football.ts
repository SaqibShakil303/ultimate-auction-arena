// Footballer card dataset.
// IMPORTANT: every rating below is a FICTIONALIZED GAME VALUE invented for this auction game.
// They are not official ratings from any publisher, league or governing body.
// "club" is the club each player is most associated with in this game's chemistry system.

import type { FootballCard, Line } from '../types';
import { rarityOf, slug } from '../util';

// [name, position, alt positions, nation, club, era, overall, six stats, trait, career clue]
// Outfield stats: PAC SHO PAS DRI DEF PHY · Goalkeeper stats: DIV HAN KIC REF SPD POS
type Row = [string, string, string, string, string, 'L' | 'M', number, number[], string, string];

const ROWS: Row[] = [
  // ───── Attackers ─────
  ['Lionel Messi', 'RW', 'CF,CAM', 'Argentina', 'Barcelona', 'M', 94, [85, 94, 95, 98, 38, 68], 'Elite Creator', "Record eight Ballon d'Or awards and a 2022 World Cup triumph"],
  ['Cristiano Ronaldo', 'ST', 'LW', 'Portugal', 'Real Madrid', 'M', 93, [88, 97, 79, 87, 35, 91], 'Clinical Finisher', 'All-time leading scorer in the UEFA Champions League'],
  ['Pelé', 'CF', 'ST,CAM', 'Brazil', 'Santos', 'L', 96, [93, 96, 91, 95, 45, 78], 'The Complete Forward', 'The only player to win three FIFA World Cups'],
  ['Diego Maradona', 'CF', 'CAM', 'Argentina', 'Napoli', 'L', 95, [90, 90, 93, 98, 40, 76], 'Genius Dribbler', 'Captained his nation to the 1986 World Cup with a legendary solo goal'],
  ['Ronaldo Nazário', 'ST', 'CF', 'Brazil', 'Real Madrid', 'L', 95, [95, 96, 80, 95, 35, 82], 'Unstoppable Phenomenon', 'Golden Boot winner at the 2002 World Cup with eight goals'],
  ['Kylian Mbappé', 'ST', 'LW', 'France', 'Paris SG', 'M', 92, [98, 91, 81, 93, 37, 78], 'Lightning Counter', 'World Cup winner as a teenager; hat-trick scorer in the 2022 final'],
  ['Erling Haaland', 'ST', '', 'Norway', 'Manchester City', 'M', 91, [90, 95, 68, 81, 45, 92], 'Goal Machine', 'Scored a record 36 goals in a single 38-game Premier League season'],
  ['Neymar', 'LW', 'CAM', 'Brazil', 'Barcelona', 'M', 90, [89, 86, 87, 95, 33, 62], 'Samba Flair', 'Olympic gold medallist in 2016 and treble winner in 2015'],
  ['Thierry Henry', 'ST', 'LW', 'France', 'Arsenal', 'L', 92, [95, 92, 84, 91, 45, 80], 'Gliding Finisher', 'Top scorer of the unbeaten "Invincibles" league season'],
  ['Johan Cruyff', 'CF', 'CAM,LW', 'Netherlands', 'Ajax', 'L', 94, [90, 91, 92, 95, 42, 74], 'Total Footballer', "Three-time Ballon d'Or winner and the face of Total Football"],
  ['Mohamed Salah', 'RW', 'ST', 'Egypt', 'Liverpool', 'M', 90, [91, 89, 83, 89, 45, 76], 'Inside Cutter', 'Multiple Premier League Golden Boots and a 2019 Champions League title'],
  ['Vinícius Júnior', 'LW', 'ST', 'Brazil', 'Real Madrid', 'M', 90, [96, 85, 80, 93, 30, 68], 'Electric Winger', 'Scored in two separate Champions League final victories'],
  ['Robert Lewandowski', 'ST', '', 'Poland', 'Bayern Munich', 'M', 91, [78, 93, 80, 86, 44, 83], 'Penalty-Box Predator', 'Scored five goals in nine minutes in a single league match'],
  ['Harry Kane', 'ST', 'CF', 'England', 'Tottenham', 'M', 90, [70, 94, 85, 83, 49, 84], 'Playmaking Nine', "His country's all-time record goalscorer"],
  ['Karim Benzema', 'ST', 'CF', 'France', 'Real Madrid', 'M', 90, [79, 90, 84, 88, 40, 79], 'Link-Up Maestro', "2022 Ballon d'Or winner"],
  ['Luis Suárez', 'ST', '', 'Uruguay', 'Barcelona', 'M', 90, [80, 92, 83, 86, 45, 84], 'Relentless Poacher', 'European Golden Shoe winner in two different leagues'],
  ['Ronaldinho', 'LW', 'CAM', 'Brazil', 'Barcelona', 'L', 93, [90, 88, 91, 97, 37, 79], 'Joyful Magician', "2005 Ballon d'Or winner and 2002 World Cup champion"],
  ["Samuel Eto'o", 'ST', 'RW', 'Cameroon', 'Barcelona', 'L', 90, [92, 90, 78, 87, 42, 79], 'Big-Game Striker', 'Won back-to-back continental trebles with two different clubs'],
  ['Didier Drogba', 'ST', '', 'Ivory Coast', 'Chelsea', 'L', 88, [80, 88, 72, 80, 45, 92], 'Final Specialist', 'Scored the equaliser and the winning penalty in the 2012 Champions League final'],
  ['Zlatan Ibrahimović', 'ST', 'CF', 'Sweden', 'AC Milan', 'L', 90, [78, 91, 82, 88, 40, 90], 'Acrobatic Powerhouse', 'Won league titles in four different countries'],
  ['Lamine Yamal', 'RW', '', 'Spain', 'Barcelona', 'M', 88, [89, 82, 85, 92, 30, 58], 'Teenage Prodigy', 'Youngest goalscorer in European Championship history'],
  ['Bukayo Saka', 'RW', 'LW', 'England', 'Arsenal', 'M', 87, [86, 83, 83, 88, 58, 70], 'Starboy Winger', 'Back-to-back England Player of the Year awards'],
  ['Son Heung-min', 'LW', 'ST', 'South Korea', 'Tottenham', 'M', 88, [88, 89, 82, 86, 42, 69], 'Two-Footed Finisher', 'First Asian player to win the Premier League Golden Boot'],
  ['Wayne Rooney', 'CF', 'ST,CAM', 'England', 'Manchester United', 'L', 90, [82, 89, 86, 85, 55, 86], 'Street Fighter', 'All-time record goalscorer for his most famous club'],
  ['Marco van Basten', 'ST', '', 'Netherlands', 'AC Milan', 'L', 93, [84, 95, 80, 88, 40, 82], 'Volley Virtuoso', "Three-time Ballon d'Or winner; iconic volley in the Euro 1988 final"],
  ['Romário', 'ST', '', 'Brazil', 'Barcelona', 'L', 93, [90, 95, 80, 93, 32, 70], 'Box Assassin', 'Golden Ball winner at the 1994 World Cup'],
  ['Eusébio', 'ST', 'CF', 'Portugal', 'Benfica', 'L', 92, [93, 94, 80, 90, 40, 82], 'Panther of Lisbon', 'Top scorer of the 1966 World Cup with nine goals'],
  ['Ferenc Puskás', 'CF', 'ST', 'Hungary', 'Real Madrid', 'L', 94, [84, 97, 90, 91, 38, 76], 'Galloping Major', "FIFA's goal-of-the-year award carries his name"],
  ['Gerd Müller', 'ST', '', 'Germany', 'Bayern Munich', 'L', 93, [82, 97, 72, 84, 40, 80], 'Der Bomber', 'Scored the winning goal in the 1974 World Cup final'],
  ['George Best', 'RW', 'LW', 'Northern Ireland', 'Manchester United', 'L', 91, [92, 88, 84, 96, 40, 68], 'Fifth Beatle', "1968 Ballon d'Or and European Cup winner"],
  ['Garrincha', 'RW', '', 'Brazil', 'Botafogo', 'L', 92, [93, 85, 86, 98, 30, 62], 'Joy of the People', 'Two-time World Cup winner and star of the 1962 tournament'],
  ['Roberto Baggio', 'CF', 'CAM', 'Italy', 'Juventus', 'L', 91, [84, 90, 90, 94, 38, 66], 'Divine Ponytail', "1993 Ballon d'Or winner"],
  ['Ousmane Dembélé', 'RW', 'ST,LW', 'France', 'Paris SG', 'M', 88, [93, 86, 83, 91, 40, 62], 'Two-Footed Chaos', "2025 Ballon d'Or winner after a continental title"],
  ['Lautaro Martínez', 'ST', '', 'Argentina', 'Inter Milan', 'M', 87, [81, 88, 75, 84, 48, 84], 'Tireless Bull', 'Top scorer at the 2024 Copa América'],
  ['Victor Osimhen', 'ST', '', 'Nigeria', 'Napoli', 'M', 85, [90, 86, 66, 79, 40, 84], 'Aerial Sprinter', 'Top scorer in a drought-ending Serie A title campaign'],
  ['Khvicha Kvaratskhelia', 'LW', '', 'Georgia', 'Napoli', 'M', 85, [86, 82, 82, 90, 42, 70], 'Unpredictable Dribbler', 'League MVP in his debut Serie A season'],
  ['Alexander Isak', 'ST', '', 'Sweden', 'Newcastle United', 'M', 85, [86, 86, 74, 86, 38, 72], 'Smooth Operator', 'Scored in the 2025 League Cup final to end a 70-year domestic trophy wait'],
  ['Julián Álvarez', 'ST', 'CF', 'Argentina', 'Manchester City', 'M', 85, [82, 85, 80, 85, 52, 74], 'Pressing Spider', 'Won the World Cup and a continental treble in the same season'],
  ['Nico Williams', 'LW', 'RW', 'Spain', 'Athletic Club', 'M', 84, [94, 78, 79, 88, 32, 64], 'Touchline Burner', 'Scored in the Euro 2024 final'],
  ['Rafael Leão', 'LW', 'ST', 'Portugal', 'AC Milan', 'M', 84, [93, 80, 76, 88, 28, 76], 'Long-Stride Runner', 'League MVP in a title-winning Serie A season'],
  ['Cody Gakpo', 'LW', 'ST', 'Netherlands', 'Liverpool', 'M', 82, [84, 82, 78, 84, 40, 76], 'Cut-Inside Scorer', 'Joint top scorer at Euro 2024'],
  ['Ollie Watkins', 'ST', '', 'England', 'Aston Villa', 'M', 82, [85, 83, 72, 80, 40, 78], 'Channel Runner', 'Scored a last-minute semi-final winner at Euro 2024'],
  ['Marcus Rashford', 'LW', 'ST', 'England', 'Manchester United', 'M', 81, [90, 82, 76, 84, 38, 74], 'Direct Runner', 'Scored 30 goals in a single club season'],
  ['Darwin Núñez', 'ST', '', 'Uruguay', 'Liverpool', 'M', 80, [90, 79, 68, 76, 40, 86], 'Agent of Chaos', 'English league champion in 2025'],
  ['Sunil Chhetri', 'ST', 'CF', 'India', 'Bengaluru FC', 'M', 78, [76, 80, 72, 78, 40, 66], 'Captain Fantastic', "His nation's all-time top scorer and most-capped player"],

  // ───── Midfielders ─────
  ['Zinedine Zidane', 'CAM', 'CM', 'France', 'Real Madrid', 'L', 95, [78, 88, 95, 96, 60, 80], 'Elegant Conductor', 'Scored twice in the 1998 World Cup final'],
  ['Xavi', 'CM', '', 'Spain', 'Barcelona', 'L', 92, [70, 74, 96, 90, 66, 66], 'Metronome', 'Passing heartbeat of the side that won Euro 2008, the 2010 World Cup and Euro 2012'],
  ['Andrés Iniesta', 'CM', 'CAM,LW', 'Spain', 'Barcelona', 'L', 92, [76, 76, 93, 95, 60, 62], 'Silent Illusionist', 'Scored the winning goal in the 2010 World Cup final'],
  ['Kevin De Bruyne', 'CM', 'CAM', 'Belgium', 'Manchester City', 'M', 91, [74, 88, 95, 87, 62, 76], 'Assist King', 'Equalled the Premier League single-season assist record with 20'],
  ['Luka Modrić', 'CM', '', 'Croatia', 'Real Madrid', 'M', 91, [74, 78, 92, 91, 72, 66], 'Outside-Boot Artist', "2018 Ballon d'Or winner and World Cup Golden Ball recipient"],
  ['Toni Kroos', 'CM', 'CDM', 'Germany', 'Real Madrid', 'M', 90, [58, 82, 95, 82, 70, 70], 'Precision Sniper', 'World Cup winner in 2014 and six-time European club champion'],
  ['Jude Bellingham', 'CAM', 'CM', 'England', 'Real Madrid', 'M', 90, [82, 86, 84, 89, 76, 86], 'Late-Run Hero', 'League Player of the Season and European champion in his debut year in Spain'],
  ['Rodri', 'CDM', 'CM', 'Spain', 'Manchester City', 'M', 91, [62, 80, 88, 82, 88, 86], 'Control Tower', "2024 Ballon d'Or winner; scored the winner in the 2023 Champions League final"],
  ['Pedri', 'CM', 'CAM', 'Spain', 'Barcelona', 'M', 88, [74, 74, 89, 90, 68, 66], 'Press-Resistant Brain', 'Golden Boy winner and best young player of Euro 2020'],
  ['Kaká', 'CAM', '', 'Brazil', 'AC Milan', 'L', 91, [92, 88, 88, 92, 42, 76], 'Galloping Playmaker', "2007 Ballon d'Or winner"],
  ['Andrea Pirlo', 'CDM', 'CM', 'Italy', 'AC Milan', 'L', 91, [62, 80, 96, 88, 66, 64], 'The Architect', 'Man of the Match in the 2006 World Cup final'],
  ['Steven Gerrard', 'CM', 'CDM', 'England', 'Liverpool', 'L', 89, [78, 88, 88, 82, 76, 84], 'Captain Thunder', 'Captained the 2005 "Miracle of Istanbul" comeback'],
  ['Frank Lampard', 'CM', 'CAM', 'England', 'Chelsea', 'L', 88, [74, 90, 86, 80, 68, 80], 'Arriving Goalscorer', "His club's all-time record scorer — from midfield"],
  ['Paul Scholes', 'CM', 'CAM', 'England', 'Manchester United', 'L', 88, [70, 88, 92, 84, 62, 72], 'Ginger Maestro', 'Eleven-time English league champion with a single club'],
  ['Lothar Matthäus', 'CM', 'CDM,CB', 'Germany', 'Bayern Munich', 'L', 93, [86, 90, 90, 86, 88, 86], 'Complete Engine', 'Captained the 1990 World Cup winners; first FIFA World Player of the Year'],
  ['Michel Platini', 'CAM', 'CF', 'France', 'Juventus', 'L', 93, [78, 93, 94, 90, 48, 72], 'Free-Kick King', "Three straight Ballon d'Or wins and nine goals at Euro 1984"],
  ["N'Golo Kanté", 'CDM', 'CM', 'France', 'Chelsea', 'M', 88, [80, 66, 78, 82, 90, 84], 'Everywhere Man', 'Won back-to-back Premier League titles with two different clubs'],
  ['Sergio Busquets', 'CDM', '', 'Spain', 'Barcelona', 'M', 88, [50, 62, 88, 82, 86, 78], 'Invisible Pivot', 'World Cup, Euros and multiple Champions League titles as a one-club pivot'],
  ['Patrick Vieira', 'CDM', 'CM', 'France', 'Arsenal', 'L', 89, [78, 76, 84, 82, 88, 92], 'Long-Legged Enforcer', 'Captain of the unbeaten "Invincibles"'],
  ['Yaya Touré', 'CM', 'CDM', 'Ivory Coast', 'Manchester City', 'L', 88, [78, 86, 86, 84, 80, 90], 'Rampaging Colossus', 'Four consecutive African Footballer of the Year awards'],
  ['Bruno Fernandes', 'CAM', 'CM', 'Portugal', 'Manchester United', 'M', 87, [72, 86, 90, 82, 66, 76], 'Risk-Taking Creator', 'Repeated club Player of the Year as captain and chief creator'],
  ['Martin Ødegaard', 'CAM', 'CM', 'Norway', 'Arsenal', 'M', 87, [74, 80, 90, 89, 62, 66], 'Left-Footed Schemer', 'Made his senior international debut at just 15'],
  ['Federico Valverde', 'CM', 'RM,CDM', 'Uruguay', 'Real Madrid', 'M', 88, [90, 84, 84, 84, 80, 86], 'Tireless Engine', 'Assisted the winning goal in the 2022 Champions League final'],
  ['Jamal Musiala', 'CAM', 'LW', 'Germany', 'Bayern Munich', 'M', 87, [84, 80, 84, 93, 60, 64], 'Slalom Dribbler', 'Joint top scorer at Euro 2024'],
  ['Florian Wirtz', 'CAM', 'LW', 'Germany', 'Bayer Leverkusen', 'M', 87, [80, 82, 88, 90, 56, 66], 'Half-Space Wizard', 'League Player of the Season in an unbeaten title run'],
  ['Declan Rice', 'CDM', 'CM', 'England', 'Arsenal', 'M', 86, [74, 74, 82, 80, 86, 86], 'Ball-Carrying Shield', 'Lifted a European trophy as captain in 2023 before a record transfer'],
  ['Clarence Seedorf', 'CM', 'CAM', 'Netherlands', 'AC Milan', 'L', 88, [78, 86, 88, 86, 74, 88], 'Thunder Shot', 'Won the Champions League with three different clubs'],
  ['David Beckham', 'RM', 'CM', 'England', 'Manchester United', 'L', 88, [74, 84, 94, 82, 62, 74], 'Crossing Specialist', 'Treble winner in 1999, famous for scoring from the halfway line'],
  ['Sócrates', 'CAM', 'CM', 'Brazil', 'Corinthians', 'L', 90, [72, 88, 92, 90, 54, 78], 'Doctor of Football', "Captain of Brazil's celebrated 1982 World Cup side"],
  ['Ruud Gullit', 'CAM', 'CF,CM', 'Netherlands', 'AC Milan', 'L', 91, [84, 88, 88, 88, 76, 90], 'Total Athlete', "1987 Ballon d'Or winner and captain of the Euro 1988 champions"],
  ['Vitinha', 'CM', '', 'Portugal', 'Paris SG', 'M', 87, [76, 78, 90, 89, 70, 64], 'Tempo Dictator', 'Midfield metronome of the 2025 Champions League winners'],
  ['Alexis Mac Allister', 'CM', 'CDM', 'Argentina', 'Liverpool', 'M', 85, [70, 80, 86, 84, 78, 76], 'Quiet Organizer', 'World Cup winner in 2022 and English champion in 2025'],
  ['Nicolò Barella', 'CM', '', 'Italy', 'Inter Milan', 'M', 85, [78, 78, 84, 84, 78, 78], 'Dynamo', 'European champion with his country in 2021'],
  ['Moisés Caicedo', 'CDM', 'CM', 'Ecuador', 'Chelsea', 'M', 84, [76, 68, 80, 80, 86, 84], 'Tackle Magnet', 'Club World Cup winner in 2025'],
  ['Dominik Szoboszlai', 'CAM', 'CM', 'Hungary', 'Liverpool', 'M', 84, [84, 84, 84, 82, 66, 80], 'Long-Range Cannon', 'Captain of his national team from the age of 22'],
  ['Aurélien Tchouaméni', 'CDM', 'CB', 'France', 'Real Madrid', 'M', 84, [74, 74, 80, 78, 86, 86], 'Interception Wall', 'World Cup finalist and Champions League winner by the age of 24'],
  ['Gavi', 'CM', '', 'Spain', 'Barcelona', 'M', 82, [76, 68, 82, 84, 72, 72], 'Fearless Terrier', 'Golden Boy and Kopa Trophy winner in 2022'],
  ['Kobbie Mainoo', 'CM', 'CDM', 'England', 'Manchester United', 'M', 79, [72, 70, 80, 84, 68, 70], 'Composed Teen', 'Scored in an FA Cup final victory as a teenager'],

  // ───── Defenders ─────
  ['Paolo Maldini', 'LB', 'CB', 'Italy', 'AC Milan', 'L', 94, [86, 56, 76, 72, 97, 84], 'Timeless Guardian', 'Five-time European Cup winner across 25 seasons at one club'],
  ['Franz Beckenbauer', 'CB', 'CDM', 'Germany', 'Bayern Munich', 'L', 95, [80, 74, 90, 86, 95, 82], 'Der Kaiser', 'Won the World Cup as both captain and manager'],
  ['Virgil van Dijk', 'CB', '', 'Netherlands', 'Liverpool', 'M', 90, [80, 60, 74, 72, 92, 90], 'Calm Colossus', "Runner-up for the 2019 Ballon d'Or — rare for a defender"],
  ['Sergio Ramos', 'CB', 'RB', 'Spain', 'Real Madrid', 'M', 90, [78, 72, 76, 74, 90, 88], 'Clutch Header', 'Scored a 93rd-minute equaliser in the 2014 Champions League final'],
  ['Cafu', 'RB', 'RWB', 'Brazil', 'AC Milan', 'L', 91, [92, 62, 82, 82, 88, 82], 'Pendolino', 'Only player to appear in three consecutive World Cup finals'],
  ['Roberto Carlos', 'LB', 'LWB', 'Brazil', 'Real Madrid', 'L', 90, [94, 84, 80, 80, 82, 84], 'Bullet Left Foot', 'Famous for a physics-defying free kick in 1997'],
  ['Carles Puyol', 'CB', 'RB', 'Spain', 'Barcelona', 'L', 89, [76, 50, 68, 66, 92, 88], 'Lionheart', 'Headed the semi-final winner at the 2010 World Cup'],
  ['Alessandro Nesta', 'CB', '', 'Italy', 'AC Milan', 'L', 91, [80, 42, 70, 70, 95, 84], 'Tackling Artist', 'World Cup winner in 2006 and two-time Champions League winner'],
  ['Fabio Cannavaro', 'CB', '', 'Italy', 'Juventus', 'L', 91, [84, 45, 66, 68, 95, 84], 'Wall of Berlin', "Won the 2006 Ballon d'Or as a World Cup-winning captain"],
  ['Franco Baresi', 'CB', '', 'Italy', 'AC Milan', 'L', 93, [80, 50, 80, 76, 97, 80], 'Offside Trap Master', 'His club retired the number 6 shirt in his honour'],
  ['Philipp Lahm', 'RB', 'LB,CDM', 'Germany', 'Bayern Munich', 'L', 90, [82, 60, 88, 84, 90, 70], 'Magic Dwarf', 'Captained the 2014 World Cup winners'],
  ['Bobby Moore', 'CB', '', 'England', 'West Ham United', 'L', 91, [72, 50, 82, 76, 95, 80], 'Perfect Tackle', 'Captain of the 1966 World Cup winners'],
  ['Thiago Silva', 'CB', '', 'Brazil', 'Paris SG', 'M', 87, [68, 52, 76, 72, 90, 80], 'Ageless Reader', 'Champions League winner at the age of 36'],
  ['Marcelo', 'LB', 'LWB,LM', 'Brazil', 'Real Madrid', 'M', 87, [82, 72, 86, 90, 78, 74], 'Samba Full-Back', 'Five-time Champions League winner from left-back'],
  ['Dani Alves', 'RB', 'RWB,RM', 'Brazil', 'Barcelona', 'M', 88, [86, 72, 88, 86, 80, 74], 'Overlap Engine', 'One of the most decorated players in football history'],
  ['Rúben Dias', 'CB', '', 'Portugal', 'Manchester City', 'M', 88, [66, 42, 70, 68, 90, 88], 'Vocal Organizer', 'League Player of the Season in his debut year in England'],
  ['Achraf Hakimi', 'RB', 'RWB,RM', 'Morocco', 'Paris SG', 'M', 87, [94, 76, 82, 84, 80, 78], 'Rocket Wing-Back', 'World Cup semi-finalist in 2022 and scorer in the 2025 Champions League final'],
  ['Trent Alexander-Arnold', 'RB', 'CM', 'England', 'Liverpool', 'M', 86, [78, 74, 92, 82, 76, 70], 'Quarterback Full-Back', 'Took the quick corner that completed a famous 4–0 semi-final comeback'],
  ['William Saliba', 'CB', '', 'France', 'Arsenal', 'M', 87, [82, 38, 72, 74, 89, 84], 'Ice-Cold Stopper', 'Named in the Premier League Team of the Year in consecutive seasons'],
  ['Giorgio Chiellini', 'CB', 'LB', 'Italy', 'Juventus', 'L', 88, [70, 46, 64, 60, 93, 90], 'Gladiator', 'Captained the Euro 2020 champions'],
  ['Nemanja Vidić', 'CB', '', 'Serbia', 'Manchester United', 'L', 87, [68, 50, 60, 58, 92, 92], 'Fearless Blocker', 'Two-time Premier League Player of the Season'],
  ['Rio Ferdinand', 'CB', '', 'England', 'Manchester United', 'L', 87, [80, 45, 72, 72, 90, 84], 'Cultured Sweeper', 'Captained his side on the night of a 2008 Champions League final win'],
  ['Vincent Kompany', 'CB', '', 'Belgium', 'Manchester City', 'L', 87, [74, 56, 70, 68, 90, 90], 'Captain Thunderbolt', 'Long-range screamer that all but sealed a 2019 league title'],
  ['Javier Zanetti', 'RB', 'LB,CDM', 'Argentina', 'Inter Milan', 'L', 88, [84, 62, 80, 80, 88, 86], 'Il Trattore', 'Treble-winning captain with more than 850 appearances for one club'],
  ['Marquinhos', 'CB', 'CDM', 'Brazil', 'Paris SG', 'M', 86, [78, 50, 76, 74, 88, 80], 'Recovery Ace', 'Captain of the 2025 Champions League winners'],
  ['Dani Carvajal', 'RB', '', 'Spain', 'Real Madrid', 'M', 86, [80, 60, 80, 80, 84, 80], 'Big-Final Warrior', 'Six-time Champions League winner who scored in the 2024 final'],
  ['Joško Gvardiol', 'CB', 'LB', 'Croatia', 'Manchester City', 'M', 85, [80, 60, 74, 76, 86, 86], 'Masked Marauder', "Standout young defender of the 2022 World Cup's bronze medallists"],
  ['Kalidou Koulibaly', 'CB', '', 'Senegal', 'Napoli', 'M', 85, [76, 35, 62, 64, 88, 90], 'Mountain', 'Captained the 2021 Africa Cup of Nations winners'],
  ['Alphonso Davies', 'LB', 'LM', 'Canada', 'Bayern Munich', 'M', 84, [96, 66, 76, 84, 74, 76], 'Roadrunner', "Scored his nation's first-ever men's World Cup goal"],
  ['Theo Hernández', 'LB', 'LWB', 'France', 'AC Milan', 'M', 84, [93, 74, 76, 82, 76, 84], 'Freight Train', 'Scored a semi-final goal at the 2022 World Cup'],
  ['Kim Min-jae', 'CB', '', 'South Korea', 'Napoli', 'M', 84, [80, 40, 66, 66, 87, 88], 'The Monster', "Named Serie A's best defender in a title-winning debut season"],
  ['Kyle Walker', 'RB', 'CB', 'England', 'Manchester City', 'M', 84, [92, 60, 74, 76, 82, 84], 'Recovery Sprinter', 'Treble winner in 2023'],
  ['Andrew Robertson', 'LB', '', 'Scotland', 'Liverpool', 'M', 84, [84, 60, 82, 80, 80, 78], 'Flying Scotsman', 'National-team captain and Champions League winner in 2019'],
  ['John Stones', 'CB', 'CDM', 'England', 'Manchester City', 'M', 83, [72, 45, 80, 78, 84, 78], 'Hybrid Playmaker', 'Treble winner who stepped into midfield from defence'],
  ['Ronald Araújo', 'CB', 'RB', 'Uruguay', 'Barcelona', 'M', 83, [84, 50, 62, 62, 84, 88], 'Duel Winner', 'Spanish league champion as a first-choice centre-back'],

  // ───── Goalkeepers (DIV HAN KIC REF SPD POS) ─────
  ['Lev Yashin', 'GK', '', 'Soviet Union', 'Dynamo Moscow', 'L', 94, [95, 92, 80, 96, 60, 95], 'Black Spider', "The only goalkeeper to win the Ballon d'Or"],
  ['Gianluigi Buffon', 'GK', '', 'Italy', 'Juventus', 'L', 92, [92, 90, 78, 93, 50, 94], 'Superman', 'World Cup winner in 2006, conceding just two goals all tournament'],
  ['Manuel Neuer', 'GK', '', 'Germany', 'Bayern Munich', 'M', 91, [90, 88, 93, 91, 62, 90], 'Sweeper Supreme', 'Golden Glove at the 2014 World Cup'],
  ['Peter Schmeichel', 'GK', '', 'Denmark', 'Manchester United', 'L', 91, [92, 88, 84, 93, 54, 90], 'Star-Jump Stopper', 'Euro 1992 champion and treble-winning captain on the night in 1999'],
  ['Oliver Kahn', 'GK', '', 'Germany', 'Bayern Munich', 'L', 91, [91, 90, 76, 93, 52, 91], 'Der Titan', 'The only goalkeeper to win the World Cup Golden Ball'],
  ['Iker Casillas', 'GK', '', 'Spain', 'Real Madrid', 'L', 90, [92, 86, 76, 95, 58, 88], 'Saint of the Posts', 'Captained wins at Euro 2008, the 2010 World Cup and Euro 2012'],
  ['Thibaut Courtois', 'GK', '', 'Belgium', 'Real Madrid', 'M', 90, [88, 90, 76, 92, 48, 90], 'Giant Wingspan', 'Man of the Match in the 2022 Champions League final'],
  ['Alisson Becker', 'GK', '', 'Brazil', 'Liverpool', 'M', 89, [88, 87, 86, 90, 56, 90], 'One-on-One King', 'Scored a stoppage-time winning header as a goalkeeper'],
  ['Edwin van der Sar', 'GK', '', 'Netherlands', 'Manchester United', 'L', 88, [86, 88, 88, 88, 50, 89], 'Ice-Cool Veteran', 'Champions League winner with two clubs, thirteen years apart'],
  ['Petr Čech', 'GK', '', 'Czech Republic', 'Chelsea', 'L', 88, [88, 90, 76, 89, 48, 90], 'Helmeted Wall', 'Record holder for Premier League clean sheets'],
  ['Gianluigi Donnarumma', 'GK', '', 'Italy', 'Paris SG', 'M', 88, [90, 84, 74, 91, 50, 86], 'Shootout Giant', 'Player of the Tournament at Euro 2020'],
  ['Ederson', 'GK', '', 'Brazil', 'Manchester City', 'M', 87, [85, 82, 95, 87, 62, 86], 'Quarterback Keeper', 'A goalkeeper credited with league assists from long passes'],
  ['Emiliano Martínez', 'GK', '', 'Argentina', 'Aston Villa', 'M', 86, [86, 84, 80, 88, 52, 85], 'Mind-Games Master', 'Golden Glove at the 2022 World Cup'],
  ['Marc-André ter Stegen', 'GK', '', 'Germany', 'Barcelona', 'M', 86, [85, 84, 90, 88, 54, 85], 'Eleventh Outfielder', 'Treble winner in his first season in Spain'],
  ['Hugo Lloris', 'GK', '', 'France', 'Tottenham', 'M', 84, [86, 80, 72, 88, 56, 82], 'Reflex Captain', 'World Cup-winning captain in 2018'],
  ['Gurpreet Singh Sandhu', 'GK', '', 'India', 'Bengaluru FC', 'M', 74, [76, 72, 68, 76, 44, 72], 'Blue Tiger Wall', 'First player from his nation to appear in a UEFA Europa League tie'],
];

export const LINE_OF: Record<string, Line> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  ST: 'ATT', CF: 'ATT', LW: 'ATT', RW: 'ATT',
};
export const LINE_NAME: Record<Line, string> = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', ATT: 'Attacker' };

const WORDS: [string, string][] = [
  ['Explosive pace', 'Lacks top-end pace'],
  ['Lethal shooting', 'Limited goal threat'],
  ['Visionary passing', 'Basic distribution'],
  ['Silky dribbling', 'Heavy touch under pressure'],
  ['Rock-solid defending', 'Offers little defensive cover'],
  ['Dominant physicality', 'Can be outmuscled'],
];
const GK_WORDS: [string, string][] = [
  ['Spectacular diving', 'Limited reach'],
  ['Safe handling', 'Spills awkward shots'],
  ['Pinpoint distribution', 'Erratic distribution'],
  ['Lightning reflexes', 'Slow reactions'],
  ['Quick off the line', 'Slow off the line'],
  ['Flawless positioning', 'Caught out of position'],
];
const STYLE_A = ['Rapid', 'Deadly', 'Visionary', 'Silky', 'Resolute', 'Powerful'];
const STYLE_N = ['Runner', 'Finisher', 'Distributor', 'Dribbler', 'Stopper', 'Athlete'];

function roleOf(pos: string, s: number[]): string {
  switch (pos) {
    case 'GK': return s[2] >= 86 ? 'Sweeper Keeper' : 'Shot Stopper';
    case 'CB': return s[2] >= 76 ? 'Ball-Playing Defender' : 'Stopper';
    case 'LB': case 'RB': case 'LWB': case 'RWB': return s[0] >= 86 ? 'Attacking Wing-Back' : 'Complete Full-Back';
    case 'CDM': return s[2] >= 86 ? 'Deep-Lying Playmaker' : 'Ball-Winning Anchor';
    case 'CM': return s[2] >= 90 ? 'Deep-Lying Playmaker' : s[4] >= 72 && s[5] >= 76 ? 'Box-to-Box Midfielder' : 'Advanced Playmaker';
    case 'CAM': return s[1] >= 86 ? 'Shadow Striker' : 'Advanced Playmaker';
    case 'LM': case 'RM': return 'Wide Playmaker';
    case 'LW': case 'RW': return s[1] >= 86 ? 'Inside Forward' : 'Touchline Winger';
    case 'CF': return 'False Nine';
    default: return s[5] >= 88 ? 'Target Forward' : s[0] >= 88 ? 'Advanced Forward' : 'Poacher';
  }
}

function build(r: Row): FootballCard {
  const [name, pos, alt, nation, club, era, overall, stats, trait, clue] = r;
  const line = LINE_OF[pos];
  const alts = alt ? alt.split(',') : [];
  const isGk = line === 'GK';
  const words = isGk ? GK_WORDS : WORDS;
  const order = stats.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const style = isGk ? (stats[2] >= 86 ? 'Ball-Playing Keeper' : stats[3] >= 92 ? 'Reflex Shot-Stopper' : 'Commanding Keeper') : `${STYLE_A[order[0].i]} ${STYLE_N[order[1].i]}`;
  return {
    kind: 'football', id: 'f-' + slug(name), name, overall, rarity: rarityOf(overall), stats, trait,
    line, pos, alt: alts, altLines: [...new Set(alts.map((a) => LINE_OF[a]).filter((l) => l && l !== line))],
    role: roleOf(pos, stats), style, nation, club, era: era === 'L' ? 'Legend' : 'Modern',
    pack: era === 'L' ? 'legends' : 'modern',
    strengths: [words[order[0].i][0], words[order[1].i][0]],
    weaknesses: [words[order[5].i][1]],
    clues: [`${LINE_NAME[line]} (${pos}) from ${nation}`, clue, `Playing style: ${style} — known in this game as the "${trait}"`],
  };
}

export const FOOTBALLERS: FootballCard[] = ROWS.map(build);
